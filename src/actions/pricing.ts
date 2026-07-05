"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";

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

/** リージョン×アイテム種別から PricingSetting.id を採番（既存2行は従来通りregion文字列のまま）。ADR-0023 */
function pricingSettingId(region: string, itemType: string): string {
  return itemType === "TRADING_CARD" ? region : `${region}_${itemType}`;
}

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
  // region_itemType はDBレベルのユニーク制約ではないため、findFirst→create/updateで一意性を担保する
  const existing = await prisma.pricingSetting.findFirst({ where: { region: region.data, itemType: itemType.data } });
  if (existing) {
    await prisma.pricingSetting.update({
      where: { id: existing.id },
      data: { proxyFee, handlingFee, freeShipInsQty },
    });
  } else {
    await prisma.pricingSetting.create({
      data: {
        id: pricingSettingId(region.data, itemType.data),
        region: region.data,
        itemType: itemType.data,
        proxyFee,
        handlingFee,
        freeShipInsQty,
      },
    });
  }
  revalidatePath("/admin/settings");
  return { success: true };
}

const autographRowSchema = z.object({ id: z.string(), fee: z.number().min(0), isActive: z.boolean() });
const saveAutographSchema = z.object({ rows: z.array(autographRowSchema) });

/** オートグラフ（デュアルサービス）追加料金（サービスレベル別）を保存 */
export async function saveAutographPricing(
  input: z.infer<typeof saveAutographSchema>
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const parsed = saveAutographSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "入力内容を確認してください" };
  for (const r of parsed.data.rows) {
    await prisma.autographPricing.update({ where: { id: r.id }, data: { fee: r.fee, isActive: r.isActive } });
  }
  revalidatePath("/admin/settings");
  return { success: true };
}
