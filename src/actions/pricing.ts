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
const saveSchema = z.object({ bands: z.array(bandSchema) });

/**
 * 送料・保険 合算マトリクス（PSA日本）を保存。
 * 各申告価格帯を 3行（1-8 / 9-25 / 26+）の ShippingInsuranceRate に展開して全置換する。
 */
export async function saveShippingInsuranceRates(
  input: z.infer<typeof saveSchema>
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "入力内容を確認してください" };

  const rows = parsed.data.bands.flatMap((b, i) => [
    { region: "PSA_JP" as const, minValue: b.minValue, maxValue: b.maxValue, qtyMin: 1, qtyMax: 8, fee: b.fee8, perCardSurcharge: 0, sortOrder: i * 3 },
    { region: "PSA_JP" as const, minValue: b.minValue, maxValue: b.maxValue, qtyMin: 9, qtyMax: 25, fee: b.fee25, perCardSurcharge: 0, sortOrder: i * 3 + 1 },
    { region: "PSA_JP" as const, minValue: b.minValue, maxValue: b.maxValue, qtyMin: 26, qtyMax: null, fee: b.fee25, perCardSurcharge: b.surcharge, sortOrder: i * 3 + 2 },
  ]);

  await prisma.$transaction([
    prisma.shippingInsuranceRate.deleteMany({ where: { region: "PSA_JP" } }),
    prisma.shippingInsuranceRate.createMany({ data: rows }),
  ]);

  revalidatePath("/admin/settings");
  return { success: true };
}

/** 事務手数料（サービス共通・一律）を保存 */
export async function saveHandlingFee(
  handlingFee: number
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const fee = Math.max(0, Math.floor(Number(handlingFee) || 0));
  await prisma.pricingSetting.upsert({
    where: { id: "default" },
    update: { handlingFee: fee },
    create: { id: "default", handlingFee: fee },
  });
  revalidatePath("/admin/settings");
  return { success: true };
}
