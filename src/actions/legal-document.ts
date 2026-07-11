"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logOperation, getClientIp } from "@/lib/operation-log";
import { LEGAL_DOCUMENT_DEFAULTS, legalDocumentPath } from "@/lib/legal-document-defaults";
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
 * （管理画面で新規作成した文書のidにはLEGAL_DOCUMENT_DEFAULTSが無いため何もしない）
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

/** フッター用。表示ONの文書のみ、制定日の古い順で返す。 */
export async function getFooterLegalDocuments() {
  await Promise.all(Object.keys(LEGAL_DOCUMENT_DEFAULTS).map((id) => ensureLegalDocument(id)));
  const docs = await prisma.legalDocument.findMany({
    where: { showInFooter: true },
    orderBy: { establishedAt: "asc" },
  });
  return docs.map((d) => ({ id: d.id, title: d.title, path: legalDocumentPath(d.id) }));
}

/** 管理画面の一覧・編集用。既定3文書を初期値投入のうえ、新規作成分も含め全件返す。 */
export async function getLegalDocuments() {
  await requireAdminOrStaff();
  await Promise.all(Object.keys(LEGAL_DOCUMENT_DEFAULTS).map((id) => ensureLegalDocument(id)));
  return prisma.legalDocument.findMany({ orderBy: { establishedAt: "asc" } });
}

// スラッグはURL(/legal/{id})にそのまま使うため、英数字・ハイフンのみ許可する。
const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*$/;

const createSchema = z.object({
  id: z.string().min(1).max(60).regex(SLUG_REGEX, "半角英数字とハイフンのみ使用できます"),
  title: z.string().min(1).max(200),
  establishedAt: z.coerce.date(),
});

export async function createLegalDocument(
  input: z.infer<typeof createSchema>
): Promise<{ success: boolean; error?: string; id?: string }> {
  const user = await requireAdminOrStaff();

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }

  const existing = await prisma.legalDocument.findUnique({ where: { id: parsed.data.id } });
  if (existing) {
    return { success: false, error: "同じスラッグの文書が既に存在します" };
  }

  const doc = await prisma.legalDocument.create({
    data: {
      id: parsed.data.id,
      title: parsed.data.title,
      body: `## ${parsed.data.title}\n\nここに本文を入力してください。`,
      establishedAt: parsed.data.establishedAt,
      updatedBy: user.id,
    },
  });

  const hdrs = await headers();
  await logOperation({
    userId: user.id,
    ipAddress: getClientIp({ headers: hdrs } as unknown as Request),
    action: "LEGAL_DOCUMENT_CREATE",
    targetType: "legal_documents",
    targetId: doc.id,
    after: { title: doc.title },
  });

  revalidatePath("/admin/legal-documents");
  return { success: true, id: doc.id };
}

const updateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  establishedAt: z.coerce.date(),
  revisedAt: z.array(z.coerce.date()),
  showInFooter: z.boolean(),
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
      showInFooter: parsed.data.showInFooter,
      updatedBy: user.id,
    },
    create: {
      id: parsed.data.id,
      title: parsed.data.title,
      body: parsed.data.body,
      establishedAt: parsed.data.establishedAt,
      revisedAt: parsed.data.revisedAt,
      showInFooter: parsed.data.showInFooter,
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
  revalidatePath(legalDocumentPath(doc.id));
  return { success: true };
}

const deleteSchema = z.object({ id: z.string().min(1) });

export async function deleteLegalDocument(
  input: z.infer<typeof deleteSchema>
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdminOrStaff();

  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "入力内容を確認してください" };
  }

  const current = await prisma.legalDocument.findUnique({ where: { id: parsed.data.id } });
  if (!current) return { success: false, error: "文書が見つかりません" };

  await prisma.legalDocument.delete({ where: { id: parsed.data.id } });

  const hdrs = await headers();
  await logOperation({
    userId: user.id,
    ipAddress: getClientIp({ headers: hdrs } as unknown as Request),
    action: "LEGAL_DOCUMENT_DELETE",
    targetType: "legal_documents",
    targetId: current.id,
    before: { title: current.title },
  });

  revalidatePath("/admin/legal-documents");
  revalidatePath(legalDocumentPath(current.id));
  return { success: true };
}
