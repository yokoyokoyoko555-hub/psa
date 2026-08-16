"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SalesPlatform } from "@prisma/client";

async function requireAdmin() {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id || user.role !== "ADMIN") throw new Error("Forbidden");
  return user;
}

const platformEnum = z.enum(["EBAY", "FANATICS_COLLECT", "GOLDIN"]);

/**
 * 管理画面表示用。ADMIN/STAFFどちらも閲覧可（仕様書§4.2: 手数料率テーブルの変更はADMINのみ、閲覧は制限しない）。
 * platform省略時は全プラットフォーム分を返す（MVPではEBAYのみデータが存在する想定）。
 */
export async function getCommissionRateTiers(platform?: SalesPlatform) {
  return prisma.commissionRateTier.findMany({
    where: platform ? { platform } : undefined,
    orderBy: [{ platform: "asc" }, { sortOrder: "asc" }],
  });
}

const tierSchema = z
  .object({
    minSaleAmountUsdMinor: z.number().int().min(0),
    maxSaleAmountUsdMinor: z.number().int().nullable(),
    commissionRate: z.number().min(0).max(100),
  })
  .refine((t) => t.maxSaleAmountUsdMinor === null || t.maxSaleAmountUsdMinor > t.minSaleAmountUsdMinor, {
    message: "上限は下限より大きい金額にしてください",
  });

const saveSchema = z.object({ platform: platformEnum, tiers: z.array(tierSchema).min(1) });

/**
 * 手数料率テーブルを指定プラットフォーム分のみ全置換で保存する（既存のShippingInsuranceRateと同じ
 * delete-all-recreate方式だが、他プラットフォームの行は消さない。ADR-0080）。
 * ADMINのみ変更可（仕様書§4.2）。改定は既存の有効な買取契約に遡及適用しない方針は
 * PurchaseAgreement実装時に契約側で率をスナップショットする形で担保する（本Actionはテーブル自体の更新のみ）。
 */
export async function saveCommissionRateTiers(
  input: z.infer<typeof saveSchema>
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdmin();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }
  const { platform } = parsed.data;

  const rows = parsed.data.tiers.map((t, i) => ({
    platform,
    minSaleAmountUsdMinor: t.minSaleAmountUsdMinor,
    maxSaleAmountUsdMinor: t.maxSaleAmountUsdMinor,
    commissionRate: t.commissionRate,
    sortOrder: i,
    updatedBy: user.id,
  }));

  await prisma.$transaction([
    prisma.commissionRateTier.deleteMany({ where: { platform } }),
    prisma.commissionRateTier.createMany({ data: rows }),
  ]);

  revalidatePath("/admin/ebay/settings");
  return { success: true };
}

/** 買取契約の有効期限パターン一覧。閲覧はADMIN/STAFF可、変更はADMINのみ（仕様書§4.2）。ADR-0081/0087 */
export async function getListingDurationOptions(platform?: SalesPlatform) {
  return prisma.listingDurationOption.findMany({
    where: platform ? { platform } : undefined,
    orderBy: [{ platform: "asc" }, { sortOrder: "asc" }],
  });
}

const durationOptionSchema = z.object({
  id: z.string().optional(),
  platform: platformEnum,
  days: z.number().int().min(1).max(365),
  label: z.string().min(1).max(30),
  isActive: z.boolean(),
  sortOrder: z.number().int().default(0),
});

/** 有効期限パターンの追加・編集（idの有無で判定。CustomServicePriceと同じCRUDパターン）。ADR-0081 */
export async function saveListingDurationOption(
  input: z.infer<typeof durationOptionSchema>
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const parsed = durationOptionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }
  const { id, ...data } = parsed.data;
  if (id) {
    await prisma.listingDurationOption.update({ where: { id }, data });
  } else {
    await prisma.listingDurationOption.create({ data });
  }
  revalidatePath("/admin/ebay/settings");
  return { success: true };
}

export async function deleteListingDurationOption(id: string): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  await prisma.listingDurationOption.delete({ where: { id } });
  revalidatePath("/admin/ebay/settings");
  return { success: true };
}
