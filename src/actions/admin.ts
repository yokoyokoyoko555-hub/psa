"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { generateGroupNo, generateCardNo } from "@/lib/number-generator";
import { logOperation } from "@/lib/operation-log";
import { chargeOffSession } from "@/lib/stripe";
import { calculateFees } from "@/lib/fee-calculator";
import { sendMail, sendTemplate, upchargeNotificationHtml } from "@/lib/mailer";
import { formatMoneyIn, formatMoneyInt, roundMoney, stripeCurrency, toStripeAmount } from "@/lib/currency";
import { pricingSettingId } from "@/lib/pricing-setting-id";
import { CardStatus, Application, CustomServicePrice, ServiceRegion, ItemType } from "@prisma/client";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

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

/**
 * 申込単位で「受取完了」を記録する（スタッフが実物を受け取った際に申込詳細ページで押す）。
 * Application.receivedAtを設定し、配下カードを一括でRECEIVED_BY_STOREへ進める。ADR-0034
 */
export async function markApplicationReceived(applicationId: string) {
  const user = await requireAdminOrStaff();

  const app = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: { cards: true },
  });
  if (app.receivedAt) return { success: true }; // 既に受取済みなら何もしない（二重押下対策）

  await prisma.$transaction(async (tx) => {
    await tx.application.update({
      where: { id: applicationId },
      data: { receivedAt: new Date() },
    });
    for (const card of app.cards) {
      await tx.card.update({
        where: { id: card.id },
        data: { status: "RECEIVED_BY_STORE" },
      });
      await tx.cardStatusHistory.create({
        data: { cardId: card.id, status: "RECEIVED_BY_STORE", changedBy: user.id },
      });
    }
  });

  const hdrs = await headers();
  await logOperation({
    userId: user.id,
    ipAddress: (hdrs as unknown as Headers).get?.("x-forwarded-for") ?? "unknown",
    action: "APPLICATION_RECEIVED",
    targetType: "applications",
    targetId: applicationId,
    after: { receivedAt: new Date() },
  });

  revalidatePath(`/admin/applications/${applicationId}`);
  revalidatePath("/mypage/applications");
  return { success: true };
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

const submitPsaGroupSchema = z.object({
  region: z.nativeEnum(ServiceRegion),
  itemType: z.nativeEnum(ItemType),
  customServiceLevelId: z.string().min(1),
  customServiceLevelName: z.string().min(1),
  psaSubmissionId: z.string().min(1),
  submittedAt: z.coerce.date(),
});

/** グループに提出先・アイテム種別・サービスレベル・申込番号(Sub#)・提出日を記録する（紐づけ）。ADR-0021/0051 */
export async function submitPsaGroup(groupId: string, params: z.infer<typeof submitPsaGroupSchema>) {
  await requireAdminOrStaff();
  const parsed = submitPsaGroupSchema.parse(params);

  const group = await prisma.psaSubmissionGroup.update({
    where: { id: groupId },
    data: {
      region: parsed.region,
      itemType: parsed.itemType,
      customServiceLevelId: parsed.customServiceLevelId,
      customServiceLevelName: parsed.customServiceLevelName,
      psaSubmissionId: parsed.psaSubmissionId,
      submittedAt: parsed.submittedAt,
      status: "SUBMITTED",
    },
  });

  revalidatePath("/admin/psa-groups");
  return group;
}

/**
 * PSA提出グループのステータスを、管理画面で登録済みのPSA進捗ステータス名へ一括更新する。
 * PREPARING（提出準備中）のグループには使えない（先にsubmitPsaGroupで発送完了にする必要がある）。ADR-0034
 */
export async function advanceGroupStatus(
  groupId: string,
  statusName: string
): Promise<{ success: boolean; error?: string }> {
  await requireAdminOrStaff();
  if (!statusName.trim()) return { success: false, error: "ステータスを選択してください" };

  const group = await prisma.psaSubmissionGroup.findUnique({ where: { id: groupId } });
  if (!group) return { success: false, error: "グループが見つかりません" };
  if (group.status === "PREPARING") {
    return { success: false, error: "先に発送完了（提出）を行ってください" };
  }

  await prisma.psaSubmissionGroup.update({
    where: { id: groupId },
    data: { status: statusName },
  });

  revalidatePath("/admin/psa-groups");
  return { success: true };
}

const upchargeSchema = z.object({
  cardId: z.string(),
  reason: z.string().min(1),
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
      upchargeAmount: parsed.upchargeAmount,
      status: "PENDING",
    },
  });

  // カードステータス更新
  await prisma.card.update({
    where: { id: parsed.cardId },
    data: { status: "UPCHARGE_UNPAID" },
  });

  // 顧客へメール通知（送信失敗でUpcharge自体の登録は止めない）
  try {
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
  } catch {
    // 通知メール失敗は握りつぶし、自動請求へ進む
  }

  // Stripe自動請求
  const savedMethod = await prisma.savedPaymentMethod.findFirst({
    where: { customerId: card.customerId, isDefault: true },
  });

  if (savedMethod) {
    try {
      const pi = await chargeOffSession({
        amount: toStripeAmount(parsed.upchargeAmount),
        currency: stripeCurrency(),
        customerId: card.customer.stripeCustomerId!,
        paymentMethodId: savedMethod.stripePaymentMethodId,
        description: `Upcharge: ${card.cardName}`,
        referenceId: upcharge.id,
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

/**
 * 要対応の代理申込一覧。以下の2状態を含む。
 * - 入力待ち（status=DRAFT）: 顧客が先払い済みで、店舗の明細入力待ち
 * - 未払い（status=SUBMITTED かつ 確定分請求がPENDING）: 明細入力・確定済みだが、
 *   顧客がマイページでまだ支払っていない（自動課金はしない。ADR-0042）
 * 顧客の支払いが完了（PENDING→SUCCEEDED）すると一覧から外れる。ADR-0044
 */
export async function getStoreRequests() {
  await requireAdminOrStaff();
  // 先払い（SUCCEEDED）済みのSTORE申込のみ対象。決済前の申込は含めない。ADR-0020/0021
  const apps = await prisma.application.findMany({
    where: {
      source: "STORE",
      payments: { some: { status: "SUCCEEDED" } },
      OR: [{ status: "DRAFT" }, { status: "SUBMITTED", payments: { some: { status: "PENDING" } } }],
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
    agencyQuantity: a.agencyQuantity, // 代理入力数（顧客申告）。ADR-0038
    estimatedCardCount: a.estimatedCardCount, // 申込総数（顧客申告・参考値）。ADR-0037
    awaitingPayment: a.status === "SUBMITTED", // true=入力・確定済みで顧客の支払い待ち。ADR-0044
  }));
}

const storeCardSchema = z.object({
  tcgTitle: z.string().min(1).max(200),
  // 発行年（トレカ/パック）または発行年月の自由記述（コミック・マガジン）。範囲チェックはitemType確定後にcompleteStoreApplication内で行う。ADR-0033
  releaseYear: z.string().max(20).optional(),
  cardName: z.string().min(1).max(200),
  cardNumber: z.string().max(100).optional(),
  rarity: z.string().max(100).optional(),
  // 空欄可（未入力時は「日本語」を補完。コミック・マガジンでは出版社として使用）。ADR-0033
  language: z.string().max(50).optional().transform((v) => (v && v.trim() ? v.trim() : "日本語")),
  declaredValue: z.number().int().min(1),
  quantity: z.number().int().min(1).max(100),
  notes: z.string().max(1000).optional(),
  // カードごとに選択したCustomServicePrice.id（複数サービスレベルにまたがる代理入力に対応）。ADR-0038
  customServiceLevelId: z.string().min(1),
});

// 代理入力の一時保存（下書き）。確定前の緩いバリデーション（空欄可）。
const storeDraftCardSchema = z.object({
  tcgTitle: z.string().max(200).default(""),
  releaseYear: z.string().max(20).default(""),
  cardName: z.string().max(200).default(""),
  cardNumber: z.string().max(100).default(""),
  rarity: z.string().max(100).default(""),
  language: z.string().default(""),
  declaredValue: z.number().int().min(0).default(0),
  quantity: z.number().int().min(1).max(100).default(1),
  notes: z.string().max(1000).default(""),
  customServiceLevelId: z.string().default(""), // ADR-0038
});

const saveStoreDraftSchema = z.object({
  applicationId: z.string(),
  cards: z.array(storeDraftCardSchema).max(200).default([]),
});

export type StoreInputDraft = z.infer<typeof saveStoreDraftSchema>;

/**
 * 代理入力（当社入力）の途中内容を一時保存する。Application.draftData に { cards } を格納
 * （カードごとにcustomServiceLevelIdを持つため、申込単位のcustomServiceLevelIdは不要）。ADR-0038
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
    data: {
      draftData: {
        cards: parsed.data.cards,
      },
    },
  });
  return { success: true };
}

const completeStoreSchema = z.object({
  applicationId: z.string(),
  cards: z.array(storeCardSchema).min(1).max(200), // カードごとにcustomServiceLevelIdを持つ。ADR-0038
});

/**
 * completeStoreApplication/previewStoreApplicationFeesで共通の検証＋料金計算。
 * 確定（persist）はしない。ADR-0042
 */
async function validateAndCalculateStoreFees(
  applicationId: string,
  cardsInput: z.infer<typeof storeCardSchema>[]
): Promise<
  | { error: string }
  | {
      app: Application;
      fees: Awaited<ReturnType<typeof calculateFees>>;
      priceMap: Map<string, CustomServicePrice>;
      snapshotServiceLevelId: string | null;
      snapshotServiceLevelName: string;
    }
> {
  const app = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!app) return { error: "申込が見つかりません" } as const;
  if (app.source !== "STORE" || app.status !== "DRAFT") {
    return { error: "対応可能な代理申込ではありません" } as const;
  }

  // 全itemType（トレカ含む）がCustomServicePriceを参照する。ADR-0025/0026
  // PSA_US×TRADING_CARDのみ、通常タイアに加えデュアルサービス(category=AUTOGRAPH)タイアも選択可能
  // （通常サービスの代わりに選ぶ形式・追加料金にはしない）。ADR-0029
  const isAutographEligible = app.region === "PSA_US" && app.itemType === "TRADING_CARD";
  const categoryCandidates: ("TRADING_CARD" | "UNOPENED_PACK" | "COMIC_MAGAZINE" | "AUTOGRAPH")[] = isAutographEligible
    ? [app.itemType, "AUTOGRAPH"]
    : [app.itemType];

  // カードごとに異なるサービスレベルを持ちうるため、参照される全タイアをまとめて取得する。ADR-0038
  const tierIds = [...new Set(cardsInput.map((c) => c.customServiceLevelId))];
  const prices = await prisma.customServicePrice.findMany({
    where: { id: { in: tierIds }, category: { in: categoryCandidates }, region: app.region, isActive: true },
  });
  const priceMap = new Map(prices.map((p) => [p.id, p]));
  if (priceMap.size !== tierIds.length) {
    return { error: "サービスが見つかりません" } as const;
  }

  // 申告価格上限は各カードが選択したタイアの上限と比較する。ADR-0038
  for (const c of cardsInput) {
    const price = priceMap.get(c.customServiceLevelId)!;
    if (price.maxDeclaredValue !== null && c.declaredValue > price.maxDeclaredValue) {
      return {
        error: `申告価格上限（${formatMoneyInt(price.maxDeclaredValue, app.region)}）を超えるカードがあります（${c.cardName}: ${formatMoneyInt(c.declaredValue, app.region)}）。`,
      } as const;
    }
  }

  // 発行年は「トレカ／未開封パック」のみ1900〜2100の数値を要求。コミック・マガジンは発行年月の自由記述を許可。ADR-0033
  if (app.itemType !== "COMIC_MAGAZINE") {
    const badYear = cardsInput.find((c) => {
      if (!c.releaseYear || !c.releaseYear.trim()) return false;
      const y = parseInt(c.releaseYear, 10);
      return !Number.isInteger(y) || y < 1900 || y > 2100 || String(y) !== c.releaseYear.trim();
    });
    if (badYear) {
      return { error: "発行年は1900〜2100の範囲で入力してください（空欄でも構いません）" } as const;
    }
  }

  const totalDeclaredValue = cardsInput.reduce((s, c) => s + c.declaredValue * c.quantity, 0);
  const cardCount = cardsInput.reduce((s, c) => s + c.quantity, 0);

  // Application用のサービスレベルsnapshot: 単一タイアのみならそのid/name、複数タイアにまたがる場合はidをnullにし名称を連結する。ADR-0038
  const distinctTierIds = [...new Set(cardsInput.map((c) => c.customServiceLevelId))];
  const snapshotServiceLevelId = distinctTierIds.length === 1 ? (distinctTierIds[0] ?? null) : null;
  const snapshotServiceLevelName = distinctTierIds.map((id) => priceMap.get(id)!.name).join(" / ");

  // 当社入力は手数料あり。代理入力料金は「種類数 × 手数料」（同一カードは何枚でも1種）。
  // 種類数 = 入力されたカード行数（行ごとに別カードを想定）。[ADR-0020 / PROXY_PREPAY 段階1]
  try {
    const fees = await calculateFees({
      region: app.region,
      itemType: app.itemType,
      returnMethod: app.returnMethod,
      cardCount,
      totalDeclaredValue,
      applyAgencyFee: true,
      agencyCardTypeCount: cardsInput.length,
      customerId: app.customerId,
      cardServiceLevels: cardsInput.map((c) => ({ customServiceLevelId: c.customServiceLevelId, quantity: c.quantity })),
    });
    return { app, fees, priceMap, snapshotServiceLevelId, snapshotServiceLevelName } as const;
  } catch (err) {
    console.error("Failed to calculate fees:", err);
    return { error: err instanceof Error ? err.message : "料金の計算に失敗しました" } as const;
  }
}

/**
 * 明細入力を確定する前に、料金内訳をスタッフが確認するためのプレビュー計算。
 * 確定（persist）はしない。代理入力手数料の「見積り時の種類数 → 実績の種類数」比較も返す。ADR-0042
 */
export async function previewStoreApplicationFees(
  input: z.infer<typeof completeStoreSchema>
): Promise<
  | { success: false; error: string }
  | {
      success: true;
      fees: Awaited<ReturnType<typeof calculateFees>>;
      additionalAmount: number;
      agencyTypeCountEstimated: number | null;
      agencyTypeCountActual: number;
    }
> {
  await requireAdminOrStaff();
  const parsed = completeStoreSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "入力内容が正しくありません" };

  const result = await validateAndCalculateStoreFees(parsed.data.applicationId, parsed.data.cards);
  if ("error" in result) return { success: false, error: result.error };

  const additionalAmount = Math.max(0, Math.round(result.fees.totalAmount - result.app.prepaidAmount));
  return {
    success: true,
    fees: result.fees,
    additionalAmount,
    agencyTypeCountEstimated: result.app.agencyQuantity,
    agencyTypeCountActual: parsed.data.cards.length,
  };
}

/**
 * 店舗（当社）が代理申込にカード明細・サービスを入力して確定する。カードごとに異なるサービスレベルを
 * 選択できる（複数レベルにまたがる代理入力に対応）。ADR-0038
 * 手数料あり(applyAgencyFee=true)で料金計算し、申込を SUBMITTED にする。
 * 先払い済み額(prepaidAmount)を超える残額は請求データとしてPENDING登録し、顧客がマイページで
 * 内容確認のうえ能動的に支払う（自動課金はしない）。ADR-0042
 */
export async function completeStoreApplication(
  input: z.infer<typeof completeStoreSchema>
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdminOrStaff();
  const parsed = completeStoreSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "入力内容が正しくありません" };

  const cardsInput = parsed.data.cards;
  const result = await validateAndCalculateStoreFees(parsed.data.applicationId, cardsInput);
  if ("error" in result) return { success: false, error: result.error };
  const { app, fees, priceMap, snapshotServiceLevelId, snapshotServiceLevelName } = result;

  // 先払い済み額(prepaidAmount)を超える残額のみ確定分として追加請求する。ADR-0038
  const additionalAmount = Math.max(0, Math.round(fees.totalAmount - app.prepaidAmount));

  try {
    await prisma.$transaction(async (tx) => {
      await tx.application.update({
        where: { id: app.id },
        data: {
          serviceLevel: "CUSTOM",
          customServiceLevelId: snapshotServiceLevelId,
          customServiceLevelName: snapshotServiceLevelName,
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
          exchangeRateUsed: fees.exchangeRateUsed,
        },
      });

      const proxyFeePerCard =
        (await prisma.pricingSetting.findUnique({ where: { id: pricingSettingId(app.region, app.itemType) } }))
          ?.proxyFee ?? 0;

      for (const c of cardsInput) {
        const price = priceMap.get(c.customServiceLevelId)!;
        const isDualService = price.category === "AUTOGRAPH";
        const cardNo = await generateCardNo(tx);
        const psaFee = price.pricePerCard * c.quantity;
        const perCardCost = price.cost > 0 ? price.cost : roundMoney(price.pricePerCard * 0.8, app.region);
        const psaCost = perCardCost * c.quantity;
        const agencyFee = proxyFeePerCard * c.quantity;
        await tx.card.create({
          data: {
            customerId: app.customerId,
            applicationId: app.id,
            cardNo,
            tcgTitle: c.tcgTitle,
            releaseYear: c.releaseYear,
            cardName: c.cardName,
            cardNumber: c.cardNumber,
            rarity: c.rarity,
            language: c.language,
            declaredValue: c.declaredValue,
            quantity: c.quantity,
            customServiceLevelId: price.id,
            customServiceLevelName: price.name,
            psaFee,
            psaCost,
            agencyFee,
            // デュアルサービスは通常サービスの代わりに選ぶ形式のため追加料金は発生しない（0固定）。ADR-0029
            autographRequested: isDualService,
            autographFee: 0,
            autographCost: 0,
            autographCustomServiceLevelId: isDualService ? price.id : null,
            autographCustomServiceLevelName: isDualService ? price.name : null,
            status: "SUBMITTED_BY_CUSTOMER",
            statusHistory: { create: { status: "SUBMITTED_BY_CUSTOMER", changedBy: user.id } },
          },
        });
      }

      if (additionalAmount > 0) {
        await tx.payment.create({
          data: {
            customerId: app.customerId,
            applicationId: app.id,
            amount: additionalAmount,
            currency: stripeCurrency(),
            status: "PENDING",
            description: `代理申込 確定分請求 ${app.applicationNo}`,
          },
        });
      }
    });
  } catch (err) {
    console.error("Failed to complete store application:", err);
    return { success: false, error: "申込データの保存に失敗しました。入力内容をご確認のうえ、時間をおいて再度お試しください。" };
  }

  const hdrs = await headers();
  await logOperation({
    userId: user.id,
    ipAddress: (hdrs as unknown as Headers).get?.("x-forwarded-for") ?? "unknown",
    action: "STORE_APPLICATION_COMPLETE",
    targetType: "applications",
    targetId: app.id,
    after: { totalAmount: fees.totalAmount, additionalAmount },
  });

  // 先払い済み額を超える残額は自動課金せず、顧客がマイページで内容確認のうえ能動的に支払う。ADR-0042

  // 代理入力完了メール（best-effort・SMTP未設定/無効なら送信されない）
  const cust = await prisma.customer.findUnique({ where: { id: app.customerId } });
  if (cust) {
    await sendTemplate("store_input_completed", cust.email, {
      name: decrypt(cust.nameEncrypted),
      applicationNo: app.applicationNo,
      amount: formatMoneyIn(fees.totalAmount, "JPY"),
    });
  }

  return { success: true };
}
