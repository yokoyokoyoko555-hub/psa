"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { generateGroupNo, generateCardNo } from "@/lib/number-generator";
import { logOperation } from "@/lib/operation-log";
import { chargeOffSession } from "@/lib/stripe";
import { calculateFees } from "@/lib/fee-calculator";
import { sendMail, sendTemplate, upchargeNotificationHtml } from "@/lib/mailer";
import { formatMoney, roundMoney, stripeCurrency, toStripeAmount } from "@/lib/currency";
import { CardStatus, ServiceLevel } from "@prisma/client";
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
    // PSA提出待ち: グループ割当済みだが未提出（PREPARING）の申込
    prisma.application.count({ where: { psaSubmissionGroup: { status: "PREPARING" } } }),
    // PSA返却待ち: 提出済み（SUBMITTED）グループの申込
    prisma.application.count({ where: { psaSubmissionGroup: { status: "SUBMITTED" } } }),
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

/** 申込単位でPSA提出グループを作成し、選択した申込を割り当てる。ADR-0021 */
export async function createPsaSubmissionGroup(applicationIds: string[]) {
  await requireAdminOrStaff();
  if (applicationIds.length === 0) return null;

  const groupNo = await generateGroupNo();
  const group = await prisma.$transaction(async (tx) => {
    const g = await tx.psaSubmissionGroup.create({ data: { groupNo } });
    await tx.application.updateMany({
      where: { id: { in: applicationIds } },
      data: { psaSubmissionGroupId: g.id },
    });
    return g;
  });

  return group;
}

/** グループにPSAサブミッションID・申請番号(order ID)・提出日を記録するのみ（紐づけ）。ADR-0021 */
export async function submitPsaGroup(
  groupId: string,
  params: { psaSubmissionId: string; psaOrderId: string; submittedAt: Date }
) {
  await requireAdminOrStaff();

  const group = await prisma.psaSubmissionGroup.update({
    where: { id: groupId },
    data: {
      psaSubmissionId: params.psaSubmissionId,
      psaOrderId: params.psaOrderId,
      submittedAt: params.submittedAt,
      status: "SUBMITTED",
    },
  });

  return group;
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
    include: { customer: true, application: { select: { region: true } } },
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
        amount: toStripeAmount(parsed.upchargeAmount, card.application.region),
        currency: stripeCurrency(card.application.region),
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
  // 先払い（SUCCEEDED）済みの STORE 申込のみ「要対応」に表示。決済前の申込は含めない。ADR-0020/0021
  const apps = await prisma.application.findMany({
    where: {
      source: "STORE",
      status: "DRAFT",
      payments: { some: { status: "SUCCEEDED" } },
    },
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
  language: z.string().min(1).max(50),
  declaredValue: z.number().int().min(1),
  quantity: z.number().int().min(1).max(100),
  notes: z.string().max(1000).optional(),
  // オートグラフ（デュアルサービス）希望。スタッフが実物確認して選択。PSA_US×TRADING_CARD以外は保存時にfalseへ補正。ADR-0023
  autographRequested: z.boolean().default(false),
});

// 代理入力の一時保存（下書き）。確定前の緩いバリデーション（空欄可）。
const storeDraftCardSchema = z.object({
  tcgTitle: z.string().max(200).default(""),
  cardName: z.string().max(200).default(""),
  cardNumber: z.string().max(100).default(""),
  rarity: z.string().max(100).default(""),
  language: z.string().default("日本語"),
  declaredValue: z.number().int().min(0).default(0),
  quantity: z.number().int().min(1).max(100).default(1),
  notes: z.string().max(1000).default(""),
  autographRequested: z.boolean().default(false),
});

const saveStoreDraftSchema = z.object({
  applicationId: z.string(),
  serviceLevel: z.nativeEnum(ServiceLevel),
  cards: z.array(storeDraftCardSchema).max(200).default([]),
});

export type StoreInputDraft = z.infer<typeof saveStoreDraftSchema>;

/**
 * 代理入力（当社入力）の途中内容を一時保存する。Application.draftData に { serviceLevel, cards } を格納。
 * 確定は completeStoreApplication。DRAFT の STORE 申込のみ。
 */
export async function saveStoreInputDraft(
  input: z.infer<typeof saveStoreDraftSchema>
): Promise<{ success: boolean; error?: string }> {
  await requireAdminOrStaff();
  const parsed = saveStoreDraftSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "入力内容が正しくありません" };

  const app = await prisma.application.findUnique({ where: { id: parsed.data.applicationId } });
  if (!app) return { success: false, error: "申込が見つかりません" };
  if (app.source !== "STORE" || app.status !== "DRAFT") {
    return { success: false, error: "対応可能な代理申込ではありません" };
  }

  await prisma.application.update({
    where: { id: app.id },
    data: { draftData: { serviceLevel: parsed.data.serviceLevel, cards: parsed.data.cards } },
  });
  return { success: true };
}

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
    where: { serviceLevel_region_itemType: { serviceLevel: parsed.data.serviceLevel, region: app.region, itemType: app.itemType } },
  });
  if (!servicePrice) return { success: false, error: "サービスレベルが見つかりません" };

  if (servicePrice.maxDeclaredValue !== null) {
    const over = parsed.data.cards.find((c) => c.declaredValue > servicePrice.maxDeclaredValue!);
    if (over) {
      return {
        success: false,
        error: `申告価格上限（${formatMoney(servicePrice.maxDeclaredValue, app.region)}）を超えるカードがあります（${over.cardName}: ${formatMoney(over.declaredValue, app.region)}）。`,
      };
    }
  }

  // オートグラフ対象外（PSA_US×TRADING_CARD以外）は保存時にfalseへ補正
  const isAutographEligible = app.region === "PSA_US" && app.itemType === "TRADING_CARD";
  const cardsInput = parsed.data.cards.map((c) => ({
    ...c,
    autographRequested: isAutographEligible ? c.autographRequested : false,
  }));

  const totalDeclaredValue = cardsInput.reduce((s, c) => s + c.declaredValue * c.quantity, 0);
  const cardCount = cardsInput.reduce((s, c) => s + c.quantity, 0);
  const autographCount = cardsInput.filter((c) => c.autographRequested).reduce((s, c) => s + c.quantity, 0);

  // 当社入力は手数料あり。代理入力料金は「種類数 × 手数料」（同一カードは何枚でも1種）。
  // 種類数 = 入力されたカード行数（行ごとに別カードを想定）。[ADR-0020 / PROXY_PREPAY 段階1]
  const fees = await calculateFees({
    serviceLevel: parsed.data.serviceLevel,
    region: app.region,
    itemType: app.itemType,
    returnMethod: app.returnMethod,
    cardCount,
    totalDeclaredValue,
    applyAgencyFee: true,
    agencyCardTypeCount: parsed.data.cards.length,
    autographCount,
    customerId: app.customerId,
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
        autographFeeTotal: fees.autographFeeTotal,
        agencyFeeTotal: fees.agencyFeeTotal,
        handlingFee: fees.handlingFee,
        shippingFee: fees.shippingFee,
        insuranceFee: fees.insuranceFee,
        discountAmount: fees.discountAmount,
        campaignName: fees.campaignName,
        taxAmount: fees.taxAmount,
      },
    });

    const proxyFeePerCard =
      (await prisma.pricingSetting.findFirst({ where: { region: app.region, itemType: app.itemType } }))
        ?.proxyFee ?? 0;
    const autographPricing = isAutographEligible
      ? await tx.autographPricing.findUnique({
          where: { region_serviceLevel: { region: app.region, serviceLevel: parsed.data.serviceLevel } },
        })
      : null;
    for (const c of cardsInput) {
      const cardNo = await generateCardNo();
      const psaFee = servicePrice.pricePerCard * c.quantity;
      const perCardCost = servicePrice.cost > 0 ? servicePrice.cost : roundMoney(servicePrice.pricePerCard * 0.8, app.region);
      const psaCost = perCardCost * c.quantity;
      const agencyFee = proxyFeePerCard * c.quantity;
      const autographFee = c.autographRequested ? (autographPricing?.fee ?? 0) * c.quantity : 0;
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
          autographRequested: c.autographRequested,
          autographFee,
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
        currency: stripeCurrency(app.region),
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

  // 代理入力完了メール（best-effort・SMTP未設定/無効なら送信されない）
  const cust = await prisma.customer.findUnique({ where: { id: app.customerId } });
  if (cust) {
    await sendTemplate("store_input_completed", cust.email, {
      name: decrypt(cust.nameEncrypted),
      applicationNo: app.applicationNo,
      amount: formatMoney(fees.totalAmount, app.region),
    });
  }

  return { success: true };
}
