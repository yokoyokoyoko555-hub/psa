"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { generateGroupNo, generateCardNo } from "@/lib/number-generator";
import { logOperation } from "@/lib/operation-log";
import { chargeOffSession } from "@/lib/stripe";
import { calculateFees } from "@/lib/fee-calculator";
import { sendMail, upchargeNotificationHtml } from "@/lib/mailer";
import { CardStatus, CardLanguage, ServiceLevel } from "@prisma/client";
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

// ===== 代理申込（当社入力 / source=STORE） =====

/** 要対応の代理申込（顧客が依頼し、店舗の入力待ち）一覧 */
export async function getStoreRequests() {
  await requireAdminOrStaff();
  const apps = await prisma.application.findMany({
    where: { source: "STORE", status: "DRAFT" },
    include: { customer: { select: { email: true, nameEncrypted: true } }, agreement: true },
    orderBy: { createdAt: "asc" },
  });
  return apps.map((a) => ({
    id: a.id,
    applicationNo: a.applicationNo,
    region: a.region,
    returnMethod: a.returnMethod,
    createdAt: a.createdAt,
    customerEmail: a.customer.email,
    customerName: decrypt(a.customer.nameEncrypted),
  }));
}

const storeCardSchema = z.object({
  tcgTitle: z.string().min(1).max(200),
  cardName: z.string().min(1).max(200),
  cardNumber: z.string().max(100).optional(),
  rarity: z.string().max(100).optional(),
  language: z.nativeEnum(CardLanguage),
  declaredValue: z.number().int().min(1),
  quantity: z.number().int().min(1).max(100),
  notes: z.string().max(1000).optional(),
});

const completeStoreSchema = z.object({
  applicationId: z.string(),
  serviceLevel: z.nativeEnum(ServiceLevel),
  cards: z.array(storeCardSchema).min(1).max(200),
});

/**
 * 店舗（当社）が代理申込にカード明細・サービスを入力して確定する。
 * 手数料あり(applyAgencyFee=true)で料金計算し、申込を SUBMITTED にする。
 * ※ 決済（登録カードへの即時 off_session 課金）は Stripe 統合後に通電予定。現状は Payment を PENDING で作成のみ。
 */
export async function completeStoreApplication(
  input: z.infer<typeof completeStoreSchema>
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdminOrStaff();
  const parsed = completeStoreSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "入力内容が正しくありません" };

  const app = await prisma.application.findUnique({
    where: { id: parsed.data.applicationId },
  });
  if (!app) return { success: false, error: "申込が見つかりません" };
  if (app.source !== "STORE" || app.status !== "DRAFT") {
    return { success: false, error: "対応可能な代理申込ではありません" };
  }

  const servicePrice = await prisma.servicePrice.findUnique({
    where: { serviceLevel_region: { serviceLevel: parsed.data.serviceLevel, region: app.region } },
  });
  if (!servicePrice) return { success: false, error: "サービスレベルが見つかりません" };

  if (servicePrice.maxDeclaredValue !== null) {
    const over = parsed.data.cards.find((c) => c.declaredValue > servicePrice.maxDeclaredValue!);
    if (over) {
      return {
        success: false,
        error: `申告価格上限（¥${servicePrice.maxDeclaredValue.toLocaleString()}）を超えるカードがあります（${over.cardName}: ¥${over.declaredValue.toLocaleString()}）。`,
      };
    }
  }

  const totalDeclaredValue = parsed.data.cards.reduce((s, c) => s + c.declaredValue * c.quantity, 0);
  const cardCount = parsed.data.cards.reduce((s, c) => s + c.quantity, 0);

  // 当社入力は手数料あり
  const fees = await calculateFees({
    serviceLevel: parsed.data.serviceLevel,
    region: app.region,
    returnMethod: app.returnMethod,
    cardCount,
    totalDeclaredValue,
    applyAgencyFee: true,
  });

  await prisma.$transaction(async (tx) => {
    await tx.application.update({
      where: { id: app.id },
      data: {
        serviceLevel: parsed.data.serviceLevel,
        status: "SUBMITTED",
        submittedAt: new Date(),
        totalAmount: fees.totalAmount,
        psaFeeTotal: fees.psaFeeTotal,
        agencyFeeTotal: fees.agencyFeeTotal,
        shippingFee: fees.shippingFee,
        insuranceFee: fees.insuranceFee,
        taxAmount: fees.taxAmount,
      },
    });

    for (const c of parsed.data.cards) {
      const cardNo = await generateCardNo();
      const psaFee = servicePrice.pricePerCard * c.quantity;
      const psaCost = Math.floor(psaFee * 0.8);
      const agencyFee = servicePrice.agencyFee * c.quantity;
      await tx.card.create({
        data: {
          customerId: app.customerId,
          applicationId: app.id,
          cardNo,
          tcgTitle: c.tcgTitle,
          cardName: c.cardName,
          cardNumber: c.cardNumber,
          rarity: c.rarity,
          language: c.language,
          declaredValue: c.declaredValue,
          quantity: c.quantity,
          psaFee,
          psaCost,
          agencyFee,
          status: "SUBMITTED_BY_CUSTOMER",
          statusHistory: { create: { status: "SUBMITTED_BY_CUSTOMER", changedBy: user.id } },
        },
      });
    }

    // TODO(Stripe統合後): ここで登録カードへ off_session 即時決済を実行する。
    await tx.payment.create({
      data: {
        customerId: app.customerId,
        applicationId: app.id,
        amount: fees.totalAmount,
        status: "PENDING",
        description: `代理申込 ${app.applicationNo}`,
      },
    });
  });

  const hdrs = await headers();
  await logOperation({
    userId: user.id,
    ipAddress: (hdrs as unknown as Headers).get?.("x-forwarded-for") ?? "unknown",
    action: "STORE_APPLICATION_COMPLETE",
    targetType: "applications",
    targetId: app.id,
    after: { serviceLevel: parsed.data.serviceLevel, totalAmount: fees.totalAmount },
  });

  return { success: true };
}
