"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { generateGroupNo } from "@/lib/number-generator";
import { logOperation } from "@/lib/operation-log";
import { chargeOffSession } from "@/lib/stripe";
import { sendMail, upchargeNotificationHtml } from "@/lib/mailer";
import { CardStatus } from "@prisma/client";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { headers } from "next/headers";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  return session.user as { id: string; role: string };
}

async function requireAdminOrStaff() {
  const user = await requireAdmin();
  if (!["ADMIN", "STAFF"].includes(user.role)) throw new Error("Forbidden");
  return user;
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100),
});

/** ログイン中の管理者/スタッフ自身のパスワードを変更する */
export async function changeAdminPassword(
  input: z.infer<typeof changePasswordSchema>
): Promise<{ success: boolean; error?: string }> {
  const sessionUser = await requireAdminOrStaff();

  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "新しいパスワードは8文字以上で入力してください" };
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: sessionUser.id } });

  const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) {
    return { success: false, error: "現在のパスワードが正しくありません" };
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  const hdrs = await headers();
  await logOperation({
    userId: user.id,
    ipAddress: (hdrs as unknown as Headers).get?.("x-forwarded-for") ?? "unknown",
    action: "ADMIN_PASSWORD_CHANGE",
    targetType: "users",
    targetId: user.id,
  });

  return { success: true };
}

export async function getDashboardStats() {
  await requireAdminOrStaff();

  const [total, psaWaiting, psaReturning, unpaid, upchargeCount] = await Promise.all([
    prisma.application.count({ where: { status: { not: "CANCELLED" } } }),
    prisma.card.count({ where: { status: "READY_FOR_PSA" } }),
    prisma.card.count({ where: { status: "SUBMITTED_TO_PSA" } }),
    prisma.payment.count({ where: { status: "PENDING" } }),
    prisma.upcharge.count({ where: { status: "PENDING" } }),
  ]);

  return { total, psaWaiting, psaReturning, unpaid, upchargeCount };
}

export async function updateCardStatus(
  cardId: string,
  status: CardStatus,
  note?: string
) {
  const user = await requireAdminOrStaff();

  const card = await prisma.card.findUniqueOrThrow({ where: { id: cardId } });

  await prisma.$transaction([
    prisma.card.update({
      where: { id: cardId },
      data: { status, updatedAt: new Date() },
    }),
    prisma.cardStatusHistory.create({
      data: { cardId, status, note, changedBy: user.id },
    }),
  ]);

  const hdrs = await headers();
  await logOperation({
    userId: user.id,
    ipAddress: (hdrs as unknown as Headers).get?.("x-forwarded-for") ?? "unknown",
    action: "CARD_STATUS_UPDATE",
    targetType: "cards",
    targetId: cardId,
    before: { status: card.status },
    after: { status },
  });
}

export async function createPsaSubmissionGroup(cardIds: string[]) {
  const user = await requireAdminOrStaff();

  const groupNo = await generateGroupNo();
  const group = await prisma.$transaction(async (tx) => {
    const g = await tx.psaSubmissionGroup.create({
      data: { groupNo },
    });
    await tx.card.updateMany({
      where: { id: { in: cardIds } },
      data: {
        psaSubmissionGroupId: g.id,
        status: "READY_FOR_PSA",
      },
    });
    for (const cardId of cardIds) {
      await tx.cardStatusHistory.create({
        data: { cardId, status: "READY_FOR_PSA", changedBy: user.id },
      });
    }
    return g;
  });

  return group;
}

export async function submitPsaGroup(
  groupId: string,
  params: { psaSubmissionId: string; psaOrderId: string; submittedAt: Date }
) {
  const user = await requireAdminOrStaff();

  const group = await prisma.psaSubmissionGroup.update({
    where: { id: groupId },
    data: {
      psaSubmissionId: params.psaSubmissionId,
      psaOrderId: params.psaOrderId,
      submittedAt: params.submittedAt,
      status: "SUBMITTED",
    },
    include: { cards: true },
  });

  for (const card of group.cards) {
    await prisma.card.update({
      where: { id: card.id },
      data: {
        psaSubmissionId: params.psaSubmissionId,
        psaOrderId: params.psaOrderId,
        status: "SUBMITTED_TO_PSA",
      },
    });
    await prisma.cardStatusHistory.create({
      data: { cardId: card.id, status: "SUBMITTED_TO_PSA", changedBy: user.id },
    });
  }

  return group;
}

export async function recordGrade(
  cardId: string,
  params: { psaCertNo: string; psaGrade: string }
) {
  const user = await requireAdminOrStaff();

  await prisma.card.update({
    where: { id: cardId },
    data: {
      psaCertNo: params.psaCertNo,
      psaGrade: params.psaGrade,
      psaGradedAt: new Date(),
      status: "GRADE_AVAILABLE",
    },
  });
  await prisma.cardStatusHistory.create({
    data: { cardId, status: "GRADE_AVAILABLE", changedBy: user.id },
  });
}

const upchargeSchema = z.object({
  cardId: z.string(),
  reason: z.string().min(1),
  psaDeclaredValue: z.number().int().min(0),
  psaFinalValue: z.number().int().min(0),
  upchargeAmount: z.number().int().min(1),
});

export async function createUpcharge(input: z.infer<typeof upchargeSchema>) {
  const user = await requireAdminOrStaff();
  const parsed = upchargeSchema.parse(input);

  const card = await prisma.card.findUniqueOrThrow({
    where: { id: parsed.cardId },
    include: { customer: true },
  });

  const customerName = decrypt(card.customer.nameEncrypted);

  const upcharge = await prisma.upcharge.create({
    data: {
      cardId: parsed.cardId,
      customerId: card.customerId,
      reason: parsed.reason,
      psaDeclaredValue: parsed.psaDeclaredValue,
      psaFinalValue: parsed.psaFinalValue,
      upchargeAmount: parsed.upchargeAmount,
      status: "PENDING",
    },
  });

  // カードステータス更新
  await prisma.card.update({
    where: { id: parsed.cardId },
    data: { status: "UPCHARGE_UNPAID" },
  });

  // 顧客へメール通知
  await sendMail({
    to: card.customer.email,
    subject: "【トレカビンクス】Upcharge（追加請求）のお知らせ",
    html: upchargeNotificationHtml({
      customerName,
      cardName: card.cardName,
      reason: parsed.reason,
      amount: parsed.upchargeAmount,
      appUrl: process.env.APP_URL!,
    }),
  });

  await prisma.upcharge.update({
    where: { id: upcharge.id },
    data: { notifiedAt: new Date() },
  });

  // Stripe自動請求
  const savedMethod = await prisma.savedPaymentMethod.findFirst({
    where: { customerId: card.customerId, isDefault: true },
  });

  if (savedMethod) {
    try {
      const pi = await chargeOffSession({
        amount: parsed.upchargeAmount,
        customerId: card.customer.stripeCustomerId!,
        paymentMethodId: savedMethod.stripePaymentMethodId,
        description: `Upcharge: ${card.cardName}`,
        upchargeId: upcharge.id,
      });

      await prisma.upcharge.update({
        where: { id: upcharge.id },
        data: {
          status: "PAID",
          stripePaymentIntentId: pi.id,
          paidAt: new Date(),
        },
      });

      await prisma.card.update({
        where: { id: parsed.cardId },
        data: { status: "UPCHARGE_PAID" },
      });
    } catch {
      await prisma.upcharge.update({
        where: { id: upcharge.id },
        data: { status: "FAILED", failedAt: new Date() },
      });
    }
  }

  const hdrs = await headers();
  await logOperation({
    userId: user.id,
    ipAddress: (hdrs as unknown as Headers).get?.("x-forwarded-for") ?? "unknown",
    action: "UPCHARGE_CREATE",
    targetType: "upcharges",
    targetId: upcharge.id,
    after: parsed,
  });

  return upcharge;
}

export async function getAdminCards(params: {
  status?: CardStatus;
  customerId?: string;
  applicationId?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  await requireAdminOrStaff();

  const page = params.page ?? 1;
  const limit = params.limit ?? 50;
  const skip = (page - 1) * limit;

  const where = {
    ...(params.status && { status: params.status }),
    ...(params.customerId && { customerId: params.customerId }),
    ...(params.applicationId && { applicationId: params.applicationId }),
    ...(params.search && {
      OR: [
        { cardName: { contains: params.search, mode: "insensitive" as const } },
        { cardNo: { contains: params.search, mode: "insensitive" as const } },
        { psaCertNo: { contains: params.search, mode: "insensitive" as const } },
      ],
    }),
  };

  const [cards, total] = await Promise.all([
    prisma.card.findMany({
      where,
      skip,
      take: limit,
      include: {
        application: { select: { applicationNo: true } },
        customer: { select: { email: true, nameEncrypted: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.card.count({ where }),
  ]);

  return { cards, total, page, limit };
}

export async function getAdminCustomers(params: {
  search?: string;
  page?: number;
}) {
  await requireAdminOrStaff();

  const page = params.page ?? 1;
  const limit = 50;
  const skip = (page - 1) * limit;

  const customers = await prisma.customer.findMany({
    skip,
    take: limit,
    include: {
      applications: {
        select: { id: true, totalAmount: true },
      },
      _count: { select: { applications: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // メールで絞り込み（暗号化のためDB側では困難）
  const filtered = params.search
    ? customers.filter((c) => c.email.includes(params.search!))
    : customers;

  return filtered.map((c) => ({
    ...c,
    name: decrypt(c.nameEncrypted),
    nameKana: decrypt(c.nameKanaEncrypted),
    phone: decrypt(c.phoneEncrypted),
    totalAmount: c.applications.reduce((s, a) => s + a.totalAmount, 0),
    applicationCount: c._count.applications,
  }));
}
