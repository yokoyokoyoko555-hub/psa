"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logOperation, getClientIp } from "@/lib/operation-log";
import { LEGAL_DOCUMENT_DEFAULTS } from "@/lib/legal-document-defaults";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

async function requireAdminOrStaff() {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id) throw new Error("Unauthorized");
  if (!["ADMIN", "STAFF"].includes(user.role ?? "")) throw new Error("Forbidden");
  return { id: user.id, role: user.role };
}

/**
 * 規程文書がDBに無ければ初期値を投入する（冪等・既存行は一切上書きしない）。
 * 顧客向けページ・管理画面の両方から、参照前に必ず呼ぶこと。ADR-0057
 */
export async function ensureLegalDocument(id: string): Promise<void> {
  const existing = await prisma.legalDocument.findUnique({ where: { id } });
  if (existing) return;

  const defaults = LEGAL_DOCUMENT_DEFAULTS[id];
  if (!defaults) return;

  await prisma.legalDocument.create({
    data: {
      id,
      title: defaults.title,
      body: defaults.body,
      establishedAt: new Date(defaults.establishedAt),
    },
  });
}

/** 顧客向けページ用。無ければ初期値を投入したうえで返す。 */
export async function getLegalDocument(id: string) {
  await ensureLegalDocument(id);
  return prisma.legalDocument.findUnique({ where: { id } });
}

/** 管理画面の一覧・編集用。3文書すべてを初期値投入のうえ返す。 */
export async function getLegalDocuments() {
  await requireAdminOrStaff();
  await Promise.all(Object.keys(LEGAL_DOCUMENT_DEFAULTS).map((id) => ensureLegalDocument(id)));
  return prisma.legalDocument.findMany({ orderBy: { id: "asc" } });
}

const updateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  establishedAt: z.coerce.date(),
  revisedAt: z.coerce.date().nullable(),
});

export async function updateLegalDocument(
  input: z.infer<typeof updateSchema>
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdminOrStaff();

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "入力内容を確認してください" };
  }

  const doc = await prisma.legalDocument.upsert({
    where: { id: parsed.data.id },
    update: {
      title: parsed.data.title,
      body: parsed.data.body,
      establishedAt: parsed.data.establishedAt,
      revisedAt: parsed.data.revisedAt,
      updatedBy: user.id,
    },
    create: {
      id: parsed.data.id,
      title: parsed.data.title,
      body: parsed.data.body,
      establishedAt: parsed.data.establishedAt,
      revisedAt: parsed.data.revisedAt,
      updatedBy: user.id,
    },
  });

  const hdrs = await headers();
  await logOperation({
    userId: user.id,
    ipAddress: getClientIp({ headers: hdrs } as unknown as Request),
    action: "LEGAL_DOCUMENT_UPDATE",
    targetType: "legal_documents",
    targetId: doc.id,
    after: { title: doc.title },
  });

  revalidatePath("/admin/legal-documents");
  revalidatePath(`/${doc.id === "harassment_policy" ? "harassment-policy" : doc.id}`);
  return { success: true };
}
