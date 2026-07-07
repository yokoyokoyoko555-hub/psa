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

/** 管理画面で自由に追加・編集できるPSA進捗ステータス一覧（「PSA受領済み」以降の可変ステージ名）。ADR-0034 */
export async function getPsaProgressStatuses() {
  return prisma.psaProgressStatus.findMany({ orderBy: { sortOrder: "asc" } });
}

const psaProgressStatusSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(50),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});

export async function savePsaProgressStatus(
  input: z.infer<typeof psaProgressStatusSchema>
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const parsed = psaProgressStatusSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "入力内容を確認してください" };
  const { id, ...data } = parsed.data;

  if (id) {
    await prisma.psaProgressStatus.update({ where: { id }, data });
  } else {
    await prisma.psaProgressStatus.create({ data });
  }
  revalidatePath("/admin/settings");
  revalidatePath("/admin/psa-groups");
  return { success: true };
}

export async function deletePsaProgressStatus(id: string): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  await prisma.psaProgressStatus.delete({ where: { id } });
  revalidatePath("/admin/settings");
  revalidatePath("/admin/psa-groups");
  return { success: true };
}
