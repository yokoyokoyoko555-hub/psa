"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ADMIN_NAV_DEFAULTS } from "@/lib/admin-nav-defaults";
import { revalidatePath } from "next/cache";
import { z } from "zod";

async function requireAdminOrStaff() {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id) throw new Error("Unauthorized");
  if (!["ADMIN", "STAFF"].includes(user.role ?? "")) throw new Error("Forbidden");
  return { id: user.id, role: user.role };
}

/**
 * DBに無い項目（初回・またはコード側に新しいナビ項目が追加された場合）のみ既定値を投入する。
 * 既存行（管理画面で編集済みのlabel/sortOrder）は一切上書きしない。ADR-0059
 */
export async function ensureAdminNavItems(): Promise<void> {
  const existingIds = new Set((await prisma.adminNavItem.findMany({ select: { id: true } })).map((r) => r.id));
  const missing = ADMIN_NAV_DEFAULTS.filter((n) => !existingIds.has(n.id));
  if (missing.length === 0) return;

  await prisma.adminNavItem.createMany({
    data: missing.map((n) => ({ id: n.id, label: n.label, sortOrder: n.sortOrder })),
  });
}

/** サイドバー描画・設定画面の両方で使う。href/iconはコード固定、label/sortOrderはDB値を反映する。 */
export async function getAdminNavItems() {
  await ensureAdminNavItems();
  const rows = await prisma.adminNavItem.findMany({ orderBy: { sortOrder: "asc" } });
  const defsById = new Map<string, (typeof ADMIN_NAV_DEFAULTS)[number]>(
    ADMIN_NAV_DEFAULTS.map((n) => [n.id, n])
  );

  return rows
    .map((row) => {
      const def = defsById.get(row.id);
      if (!def) return null; // コード側で廃止された項目（DBに残っていても表示しない）
      return { id: row.id, href: def.href, icon: def.icon, label: row.label, sortOrder: row.sortOrder };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

const updateSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1).max(60),
      sortOrder: z.number().int(),
    })
  ),
});

export async function updateAdminNavItems(
  input: z.infer<typeof updateSchema>
): Promise<{ success: boolean; error?: string }> {
  await requireAdminOrStaff();

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "入力内容を確認してください" };
  }

  await prisma.$transaction(
    parsed.data.items.map((item) =>
      prisma.adminNavItem.update({
        where: { id: item.id },
        data: { label: item.label, sortOrder: item.sortOrder },
      })
    )
  );

  revalidatePath("/admin", "layout");
  return { success: true };
}
