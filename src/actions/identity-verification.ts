"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getCustomerSession } from "@/lib/customer-auth";
import { logOperation, getClientIp } from "@/lib/operation-log";
import { z } from "zod";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

async function requireAdminOrStaff() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const user = session.user as { id: string; role: string };
  if (!["ADMIN", "STAFF"].includes(user.role)) throw new Error("Forbidden");
  return user;
}

/** 本人確認の現在状態（マイページ表示用）。ADR-0087 */
export async function getMyIdentityVerificationStatus() {
  const customer = await getCustomerSession();
  if (!customer) throw new Error("Unauthorized");

  const [me, latest] = await Promise.all([
    prisma.customer.findUniqueOrThrow({ where: { id: customer.id }, select: { identityVerifiedAt: true } }),
    prisma.identityVerification.findFirst({
      where: { customerId: customer.id },
      orderBy: { submittedAt: "desc" },
    }),
  ]);

  return { verifiedAt: me.identityVerifiedAt, latest };
}

const submitSchema = z.object({
  documentType: z.string().min(1, "書類の種類を選択してください"),
  frontImageKey: z.string().min(1, "身分証の画像をアップロードしてください"),
  backImageKey: z.string().optional(),
});

/** 顧客による本人確認申請（買取申請の前提。ADR-0087）。 */
export async function submitIdentityVerification(
  input: z.infer<typeof submitSchema>
): Promise<{ success: boolean; error?: string }> {
  const customer = await getCustomerSession();
  if (!customer) throw new Error("Unauthorized");

  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }

  // 審査待ちが既にある場合は二重申請しない
  const pending = await prisma.identityVerification.findFirst({
    where: { customerId: customer.id, status: "PENDING" },
  });
  if (pending) {
    return { success: false, error: "既に審査中の申請があります" };
  }

  const verification = await prisma.identityVerification.create({
    data: {
      customerId: customer.id,
      documentType: parsed.data.documentType,
      frontImageKey: parsed.data.frontImageKey,
      backImageKey: parsed.data.backImageKey,
    },
  });

  const hdrs = await headers();
  await logOperation({
    customerId: customer.id,
    ipAddress: getClientIp({ headers: hdrs } as unknown as Request),
    action: "SUBMIT_IDENTITY_VERIFICATION",
    targetType: "identity_verifications",
    targetId: verification.id,
  });

  revalidatePath("/mypage/verify-identity");
  revalidatePath("/admin/ebay/identity-verifications");

  return { success: true };
}

/** 審査待ちの本人確認一覧（管理画面用）。ADR-0087 */
export async function getPendingIdentityVerifications() {
  await requireAdminOrStaff();
  return prisma.identityVerification.findMany({
    where: { status: "PENDING" },
    include: { customer: true },
    orderBy: { submittedAt: "asc" },
  });
}

const reviewSchema = z.object({
  verificationId: z.string(),
  approve: z.boolean(),
  rejectionReason: z.string().optional(),
});

/** ADMIN/STAFFによる本人確認の審査（承認/却下）。承認時にCustomer.identityVerifiedAtを更新。ADR-0087 */
export async function reviewIdentityVerification(
  input: z.infer<typeof reviewSchema>
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdminOrStaff();
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }

  const verification = await prisma.identityVerification.findUnique({ where: { id: parsed.data.verificationId } });
  if (!verification) return { success: false, error: "申請が見つかりません" };
  if (verification.status !== "PENDING") return { success: false, error: "この申請は既に処理済みです" };

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.identityVerification.update({
      where: { id: verification.id },
      data: {
        status: parsed.data.approve ? "APPROVED" : "REJECTED",
        reviewedBy: user.id,
        reviewedAt: now,
        rejectionReason: parsed.data.approve ? null : parsed.data.rejectionReason,
      },
    });
    if (parsed.data.approve) {
      await tx.customer.update({
        where: { id: verification.customerId },
        data: { identityVerifiedAt: now },
      });
    }
  });

  const hdrs = await headers();
  await logOperation({
    userId: user.id,
    ipAddress: getClientIp({ headers: hdrs } as unknown as Request),
    action: parsed.data.approve ? "APPROVE_IDENTITY_VERIFICATION" : "REJECT_IDENTITY_VERIFICATION",
    targetType: "identity_verifications",
    targetId: verification.id,
  });

  revalidatePath("/admin/ebay/identity-verifications");

  return { success: true };
}
