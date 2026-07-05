"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";

async function requireStaff() {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id || !["ADMIN", "STAFF"].includes(user.role ?? "")) throw new Error("Forbidden");
  return user;
}

const masterSchema = z.object({
  id: z.string().optional(),
  tcgTitle: z.string().max(120).optional(),
  cardName: z.string().min(1).max(200),
  cardNumber: z.string().max(60).optional(),
  rarity: z.string().max(60).optional(),
  language: z.string().min(1).max(50),
});

export async function saveCardNameMaster(
  input: z.infer<typeof masterSchema>
): Promise<{ success: boolean; error?: string }> {
  await requireStaff();
  const parsed = masterSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "入力内容を確認してください" };
  const d = parsed.data;
  const data = {
    tcgTitle: d.tcgTitle?.trim() || null,
    cardName: d.cardName.trim(),
    cardNumber: d.cardNumber?.trim() || null,
    rarity: d.rarity?.trim() || null,
    language: d.language,
  };
  if (d.id) {
    await prisma.cardNameMaster.update({ where: { id: d.id }, data });
  } else {
    await prisma.cardNameMaster.create({ data });
  }
  revalidatePath("/admin/card-masters");
  return { success: true };
}

export async function deleteCardNameMaster(id: string): Promise<{ success: boolean }> {
  await requireStaff();
  await prisma.cardNameMaster.delete({ where: { id } });
  revalidatePath("/admin/card-masters");
  return { success: true };
}

/** サブミッション入力のサジェスト用検索（カード名/番号/タイトル部分一致・最大20件） */
export async function searchCardNameMasters(q: string) {
  await requireStaff();
  const term = q.trim();
  if (!term) return [];
  return prisma.cardNameMaster.findMany({
    where: {
      OR: [
        { cardName: { contains: term, mode: "insensitive" } },
        { cardNumber: { contains: term, mode: "insensitive" } },
        { tcgTitle: { contains: term, mode: "insensitive" } },
      ],
    },
    orderBy: { cardName: "asc" },
    take: 20,
  });
}
