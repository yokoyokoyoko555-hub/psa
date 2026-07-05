"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { pricingSettingId } from "@/lib/pricing-setting-id";

async function requireAdmin() {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id || user.role !== "ADMIN") throw new Error("Forbidden");
  return user;
}

// 管理画面の入力（申告価格帯ごと）。1帯 = 1-8枚/9-25枚の金額 + 26枚以上の加算単価。
const bandSchema = z.object({
  minValue: z.number().int().min(0),
  maxValue: z.number().int().nullable(), // null=上限なし
  fee8: z.number().int().min(0), // 1-8枚
  fee25: z.number().int().min(0), // 9-25枚
  surcharge: z.number().int().min(0), // 26枚以上の加算単価（円/枚）
});
const regionEnum = z.enum(["PSA_JP", "PSA_US"]);
const itemTypeEnum = z.enum(["TRADING_CARD", "UNOPENED_PACK", "COMIC_MAGAZINE"]);
const saveSchema = z.object({ region: regionEnum, itemType: itemTypeEnum.default("TRADING_CARD"), bands: z.array(bandSchema) });

/**
 * 送料・保険 合算マトリクス（リージョン×アイテム種別別）を保存。
 * 各申告価格帯を 3行（1-8 / 9-25 / 26+）の ShippingInsuranceRate に展開して全置換する。
 */
export async function saveShippingInsuranceRates(
  input: z.infer<typeof saveSchema>
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "入力内容を確認してください" };
  const { region, itemType } = parsed.data;

  const rows = parsed.data.bands.flatMap((b, i) => [
    { region, itemType, minValue: b.minValue, maxValue: b.maxValue, qtyMin: 1, qtyMax: 8, fee: b.fee8, perCardSurcharge: 0, sortOrder: i * 3 },
    { region, itemType, minValue: b.minValue, maxValue: b.maxValue, qtyMin: 9, qtyMax: 25, fee: b.fee25, perCardSurcharge: 0, sortOrder: i * 3 + 1 },
    { region, itemType, minValue: b.minValue, maxValue: b.maxValue, qtyMin: 26, qtyMax: null, fee: b.fee25, perCardSurcharge: b.surcharge, sortOrder: i * 3 + 2 },
  ]);

  await prisma.$transaction([
    prisma.shippingInsuranceRate.deleteMany({ where: { region, itemType } }),
    prisma.shippingInsuranceRate.createMany({ data: rows }),
  ]);

  revalidatePath("/admin/settings");
  return { success: true };
}

/** 代理入力料金・事務手数料・送料保険無料化枚数（リージョン×アイテム種別の一律）を保存 */
export async function saveUniformFees(input: {
  region: "PSA_JP" | "PSA_US";
  itemType?: "TRADING_CARD" | "UNOPENED_PACK" | "COMIC_MAGAZINE";
  proxyFee: number;
  handlingFee: number;
  freeShipInsQty: number;
}): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const region = regionEnum.safeParse(input.region);
  if (!region.success) return { success: false, error: "リージョンが不正です" };
  const itemType = itemTypeEnum.safeParse(input.itemType ?? "TRADING_CARD");
  if (!itemType.success) return { success: false, error: "アイテム種別が不正です" };
  const proxyFee = Math.max(0, Math.floor(Number(input.proxyFee) || 0));
  const handlingFee = Math.max(0, Math.floor(Number(input.handlingFee) || 0));
  const freeShipInsQty = Math.max(0, Math.floor(Number(input.freeShipInsQty) || 0));
  // idベースのupsertで一意性を担保する（region/itemTypeカラムでのfindFirstは既存行の
  // カラム不整合により一致しないことがあるため使わない。ADR-0023追記 / lib/pricing-setting-id.ts参照）。
  // updateでもregion/itemTypeを書き戻すことで、不整合な既存行を自己修復する。
  const id = pricingSettingId(region.data, itemType.data);
  await prisma.pricingSetting.upsert({
    where: { id },
    update: { region: region.data, itemType: itemType.data, proxyFee, handlingFee, freeShipInsQty },
    create: { id, region: region.data, itemType: itemType.data, proxyFee, handlingFee, freeShipInsQty },
  });
  revalidatePath("/admin/settings");
  return { success: true };
}

// 動的サービスタイア（トレーディングカード/未開封パック/コミック・マガジン/オートグラフ）の管理画面CRUD。ADR-0025/0026
const customServiceCategoryEnum = z.enum(["TRADING_CARD", "UNOPENED_PACK", "COMIC_MAGAZINE", "AUTOGRAPH"]);

// 旧ServicePrice(固定enum)の日本語名称マップ。移行(ensureTradingCardCustomPrices)専用。ADR-0026
const TRADING_CARD_LEVEL_LABELS: Record<string, string> = {
  VALUE: "バリュー",
  VALUE_BULK: "バリューバルク",
  VALUE_PLUS: "バリュープラス",
  VALUE_MAX: "バリューマックス",
  REGULAR: "レギュラー",
  EXPRESS: "エクスプレス",
  SUPER_EXPRESS: "スーパー・エクスプレス",
  WALK_THROUGH: "ウォーク・スルー",
  PREMIUM_1: "プレミアム 1",
  PREMIUM_2: "プレミアム 2",
  PREMIUM_3: "プレミアム 3",
  PREMIUM_5: "プレミアム 5",
  PREMIUM_10: "プレミアム 10",
};

/**
 * トレーディングカードの料金を固定enum(ServicePrice)からCustomServicePriceへ移行する（ADR-0026）。
 * リージョンごとにCustomServicePrice(category=TRADING_CARD)が1件も無ければServicePriceの現在値から複製する。
 * 冪等（既に移行済みのリージョンはスキップ）。ServicePriceの既存データは一切変更しない。
 */
export async function ensureTradingCardCustomPrices(): Promise<void> {
  for (const region of ["PSA_JP", "PSA_US"] as const) {
    const existingCount = await prisma.customServicePrice.count({
      where: { category: "TRADING_CARD", region },
    });
    if (existingCount > 0) continue;

    const servicePrices = await prisma.servicePrice.findMany({
      where: { itemType: "TRADING_CARD", region },
      orderBy: { pricePerCard: "asc" },
    });
    if (servicePrices.length === 0) continue;

    await prisma.customServicePrice.createMany({
      data: servicePrices.map((p, i) => ({
        category: "TRADING_CARD" as const,
        region: p.region,
        name: TRADING_CARD_LEVEL_LABELS[p.serviceLevel] ?? p.serviceLevel,
        pricePerCard: p.pricePerCard,
        cost: p.cost,
        maxDeclaredValue: p.maxDeclaredValue !== null ? Math.round(p.maxDeclaredValue) : null,
        isActive: p.isActive,
        sortOrder: i,
      })),
    });
  }
}

const customServicePriceSchema = z.object({
  id: z.string().optional(),
  category: customServiceCategoryEnum,
  region: regionEnum,
  name: z.string().min(1).max(100),
  pricePerCard: z.number().min(0), // USD小数点2桁
  cost: z.number().min(0), // USD小数点2桁
  maxDeclaredValue: z.number().int().min(0).nullable(), // 円・整数。nullは上限なし
  isActive: z.boolean(),
  sortOrder: z.number().int().default(0),
});

export async function saveCustomServicePrice(
  input: z.infer<typeof customServicePriceSchema>
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const parsed = customServicePriceSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "入力内容を確認してください" };
  const d = parsed.data;
  const data = {
    category: d.category,
    region: d.region,
    name: d.name,
    pricePerCard: Math.round(d.pricePerCard * 100) / 100,
    cost: Math.round(d.cost * 100) / 100,
    maxDeclaredValue: d.maxDeclaredValue,
    isActive: d.isActive,
    sortOrder: d.sortOrder,
  };
  if (d.id) {
    await prisma.customServicePrice.update({ where: { id: d.id }, data });
  } else {
    await prisma.customServicePrice.create({ data });
  }
  revalidatePath("/admin/settings");
  return { success: true };
}

export async function deleteCustomServicePrice(id: string): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  await prisma.customServicePrice.delete({ where: { id } });
  revalidatePath("/admin/settings");
  return { success: true };
}
