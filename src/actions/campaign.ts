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

const campaignSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(100),
  discountType: z.enum(["PERCENT", "FIXED"]),
  value: z.number().int().min(0),
  region: z.enum(["PSA_JP", "PSA_US"]).nullable(),
  newCustomerOnly: z.boolean(),
  startAt: z.string().min(1), // ISO（datetime-local + JST offset付与は呼び出し側）
  endAt: z.string().min(1),
  isActive: z.boolean(),
});

export async function saveCampaign(
  input: z.infer<typeof campaignSchema>
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const parsed = campaignSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "入力内容を確認してください" };
  const d = parsed.data;

  // datetime-local（タイムゾーンなし）を JST として解釈
  const parseJst = (s: string) => new Date(`${s.length === 16 ? `${s}:00` : s}+09:00`);
  const start = parseJst(d.startAt);
  const end = parseJst(d.endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { success: false, error: "期間の日時が不正です" };
  }
  if (end <= start) return { success: false, error: "終了日時は開始日時より後にしてください" };
  if (d.discountType === "PERCENT" && d.value > 100) {
    return { success: false, error: "割引率は100以下にしてください" };
  }

  const data = {
    name: d.name,
    discountType: d.discountType,
    value: d.value,
    region: d.region,
    newCustomerOnly: d.newCustomerOnly,
    startAt: start,
    endAt: end,
    isActive: d.isActive,
  };

  if (d.id) {
    await prisma.campaign.update({ where: { id: d.id }, data });
  } else {
    await prisma.campaign.create({ data });
  }
  revalidatePath("/admin/settings");
  return { success: true };
}

export async function deleteCampaign(id: string): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  await prisma.campaign.delete({ where: { id } });
  revalidatePath("/admin/settings");
  return { success: true };
}
