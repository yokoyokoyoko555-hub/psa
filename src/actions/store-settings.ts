"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const STORE_SETTINGS_ID = "default";

async function requireAdmin() {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id || user.role !== "ADMIN") throw new Error("Forbidden");
  return user;
}

/** 郵送先住所等の店舗情報を取得する（未設定時はnull）。ADR-0035 */
export async function getStoreSettings() {
  return prisma.storeSettings.findUnique({ where: { id: STORE_SETTINGS_ID } });
}

const storeSettingsSchema = z.object({
  postalCode: z.string().max(20),
  address: z.string().max(200),
  storeName: z.string().max(100),
  phone: z.string().max(30),
});

export async function saveStoreSettings(
  input: z.infer<typeof storeSettingsSchema>
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdmin();
  const parsed = storeSettingsSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "入力内容を確認してください" };

  await prisma.storeSettings.upsert({
    where: { id: STORE_SETTINGS_ID },
    update: { ...parsed.data, updatedBy: user.id },
    create: { id: STORE_SETTINGS_ID, ...parsed.data, updatedBy: user.id },
  });
  revalidatePath("/admin/settings");
  revalidatePath("/mypage/submission-booking");
  return { success: true };
}
