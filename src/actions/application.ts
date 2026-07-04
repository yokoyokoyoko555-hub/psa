"use server";

import { prisma } from "@/lib/prisma";
import { getCustomerSession } from "@/lib/customer-auth";
import { decrypt, encrypt } from "@/lib/crypto";
import { calculateFees } from "@/lib/fee-calculator";
import { generateApplicationNo, generateCardNo } from "@/lib/number-generator";
import { createCustomer as createStripeCustomer, createPaymentIntent, getStripe } from "@/lib/stripe";
import { sendTemplate } from "@/lib/mailer";
import { formatMoney } from "@/lib/currency";
import { logOperation, getClientIp } from "@/lib/operation-log";
import { CardLanguage, ServiceLevel, ServiceRegion, ReturnMethod, Prisma } from "@prisma/client";
import { z } from "zod";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

const cardSchema = z.object({
  tcgTitle: z.string().min(1).max(200),
  releaseYear: z.number().int().min(1900).max(2100).optional(),
  cardName: z.string().min(1).max(200),
  cardNumber: z.string().max(100).optional(),
  rarity: z.string().max(100).optional(),
  language: z.nativeEnum(CardLanguage).default("JAPANESE"),
  declaredValue: z.number().int().min(1),
  quantity: z.number().int().min(1).max(100),
  frontImageKey: z.string().optional(),
  backImageKey: z.string().optional(),
  damageImageKeys: z.array(z.string()).default([]),
  notes: z.string().max(1000).optional(),
});

const returnAddressSchema = z.object({
  name: z.string().min(1).max(100),
  lastName: z.string().min(1).max(50).optional(),
  firstName: z.string().min(1).max(50).optional(),
  lastNameRoman: z.string().min(1).max(50).optional(),
  firstNameRoman: z.string().min(1).max(50).optional(),
  postalCode: z.string().regex(/^\d{7}$/),
  prefecture: z.string().min(1),
  address: z.string().min(1),
  address2: z.string().optional(),
});

const applicationSchema = z.object({
  draftId: z.string().optional(), // 下書きから確定する場合
  serviceLevel: z.nativeEnum(ServiceLevel),
  region: z.nativeEnum(ServiceRegion),
  returnMethod: z.nativeEnum(ReturnMethod),
  cards: z.array(cardSchema).min(1).max(200),
  returnAddress: returnAddressSchema.optional(), // 未指定なら登録住所を使用
  shippingPhone: z.string().regex(/^[0-9-+() ]{10,20}$/), // 配送先電話（必須）
  agreementText: z.string().min(1),
  agreementVersion: z.string().min(1),
  ipAddress: z.string(),
  userAgent: z.string().optional(),
});

export type ApplicationInput = z.infer<typeof applicationSchema>;

function isStripeMissingCustomerError(err: unknown) {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "resource_missing"
  );
}

function paymentSetupErrorMessage(err: unknown) {
  if (err instanceof Error && err.message === "STRIPE_SECRET_KEY is not set") {
    return "決済設定が未完了です。管理者にお問い合わせください。";
  }
  return "決済情報の確認に失敗しました。時間をおいて再度お試しください。";
}

async function ensureStripeCustomer(customer: NonNullable<Awaited<ReturnType<typeof getCustomerSession>>>) {
  const stripe = getStripe();

  if (customer.stripeCustomerId) {
    try {
      const stripeCustomer = await stripe.customers.retrieve(customer.stripeCustomerId);
      if (!("deleted" in stripeCustomer && stripeCustomer.deleted)) {
        return customer.stripeCustomerId;
      }
    } catch (err) {
      if (!isStripeMissingCustomerError(err)) throw err;
    }
  }

  const stripeCustomer = await createStripeCustomer({
    email: customer.email,
    name: decrypt(customer.nameEncrypted),
    phone: decrypt(customer.phoneEncrypted),
  });

  await prisma.customer.update({
    where: { id: customer.id },
    data: { stripeCustomerId: stripeCustomer.id },
  });

  return stripeCustomer.id;
}

export async function createApplication(
  input: ApplicationInput
): Promise<{ success: boolean; clientSecret?: string; applicationId?: string; error?: string }> {
  const customer = await getCustomerSession();
  if (!customer) return { success: false, error: "ログインが必要です" };

  const parsed = applicationSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "入力内容が正しくありません" };

  // 申告価格上限のバリデーション（選択サービスレベル×地域の上限を超えるカードは不可）
  const servicePrice = await prisma.servicePrice.findUnique({
    where: {
      serviceLevel_region: {
        serviceLevel: parsed.data.serviceLevel,
        region: parsed.data.region,
      },
    },
  });
  if (!servicePrice) {
    return { success: false, error: "サービスレベルが見つかりません" };
  }
  if (servicePrice.maxDeclaredValue !== null) {
    const over = parsed.data.cards.find(
      (c) => c.declaredValue > servicePrice.maxDeclaredValue!
    );
    if (over) {
      return {
        success: false,
        error: `このサービスレベルの申告価格上限（¥${servicePrice.maxDeclaredValue.toLocaleString()}）を超えるカードがあります（${over.cardName || "無題"}: ¥${over.declaredValue.toLocaleString()}）。上位のサービスレベルを選択してください。`,
      };
    }
  }

  const totalDeclaredValue = parsed.data.cards.reduce(
    (sum, c) => sum + c.declaredValue * c.quantity,
    0
  );
  const cardCount = parsed.data.cards.reduce((sum, c) => sum + c.quantity, 0);

  // 顧客自身の申込は手数料なし（当社入力=STORE は管理画面の代理申込で別途）
  const fees = await calculateFees({
    serviceLevel: parsed.data.serviceLevel,
    region: parsed.data.region,
    returnMethod: parsed.data.returnMethod,
    cardCount,
    totalDeclaredValue,
    applyAgencyFee: false,
    customerId: customer.id,
  });

  let stripeCustomerId: string;
  try {
    stripeCustomerId = await ensureStripeCustomer(customer);
  } catch (err) {
    console.error("Failed to ensure Stripe customer:", err);
    return { success: false, error: paymentSetupErrorMessage(err) };
  }

  // 下書きから確定する場合は既存の申込を再利用
  let existingDraftId: string | null = null;
  if (parsed.data.draftId) {
    const d = await prisma.application.findFirst({
      where: { id: parsed.data.draftId, customerId: customer.id, status: "DRAFT" },
    });
    if (d) existingDraftId = d.id;
  }

  const applicationNo = existingDraftId ? null : await generateApplicationNo();

  const application = await prisma.$transaction(async (tx) => {
    const commonData = {
      serviceLevel: parsed.data.serviceLevel,
      region: parsed.data.region,
      source: "CUSTOMER" as const,
      returnMethod: parsed.data.returnMethod,
      shippingAddressEncrypted: parsed.data.returnAddress
        ? encrypt(JSON.stringify(parsed.data.returnAddress))
        : null,
      shippingPhoneEncrypted: encrypt(parsed.data.shippingPhone),
      totalAmount: fees.totalAmount,
      psaFeeTotal: fees.psaFeeTotal,
      agencyFeeTotal: fees.agencyFeeTotal,
      handlingFee: fees.handlingFee,
      shippingFee: fees.shippingFee,
      insuranceFee: fees.insuranceFee,
      discountAmount: fees.discountAmount,
      campaignName: fees.campaignName,
      taxAmount: fees.taxAmount,
    };

    const app = existingDraftId
      ? await tx.application.update({
          where: { id: existingDraftId },
          data: { ...commonData, draftData: Prisma.DbNull },
        })
      : await tx.application.create({
          data: {
            applicationNo: applicationNo!,
            customerId: customer.id,
            status: "DRAFT",
            ...commonData,
            draftData: Prisma.DbNull,
          },
        });

    // カード作成（顧客入力のため代行手数料は0）
    const servicePriceData = servicePrice;

    for (const cardInput of parsed.data.cards) {
      const cardNo = await generateCardNo();
      const psaFee = (servicePriceData?.pricePerCard ?? 0) * cardInput.quantity;
      const psaCost = Math.floor(psaFee * 0.8);
      const agencyFee = 0; // 顧客入力は手数料なし

      await tx.card.create({
        data: {
          customerId: customer.id,
          applicationId: app.id,
          cardNo,
          tcgTitle: cardInput.tcgTitle,
          releaseYear: cardInput.releaseYear,
          cardName: cardInput.cardName,
          cardNumber: cardInput.cardNumber,
          rarity: cardInput.rarity,
          language: cardInput.language,
          declaredValue: cardInput.declaredValue,
          quantity: cardInput.quantity,
          frontImageKey: cardInput.frontImageKey,
          backImageKey: cardInput.backImageKey,
          damageImageKeys: cardInput.damageImageKeys,
          notes: cardInput.notes,
          psaFee,
          psaCost,
          agencyFee,
          status: "DRAFT",
          statusHistory: {
            create: {
              status: "DRAFT",
              changedBy: customer.id,
            },
          },
        },
      });
    }

    // 電子同意書
    await tx.agreement.create({
      data: {
        customerId: customer.id,
        applicationId: app.id,
        ipAddress: parsed.data.ipAddress,
        userAgent: parsed.data.userAgent,
        agreementText: parsed.data.agreementText,
        version: parsed.data.agreementVersion,
      },
    });

    return app;
  });

  // Stripe PaymentIntent作成
  let paymentIntent;
  try {
    paymentIntent = await createPaymentIntent({
      amount: fees.totalAmount,
      customerId: stripeCustomerId,
      applicationId: application.id,
      description: `PSA申込 ${application.applicationNo}`,
    });
  } catch (err) {
    console.error("Failed to create Stripe PaymentIntent:", err);
    return { success: false, error: paymentSetupErrorMessage(err) };
  }

  // Payment レコード作成
  await prisma.payment.create({
    data: {
      customerId: customer.id,
      applicationId: application.id,
      stripePaymentIntentId: paymentIntent.id,
      amount: fees.totalAmount,
      status: "PENDING",
      description: `PSA申込 ${application.applicationNo}`,
    },
  });

  const hdrs = await headers();
  await logOperation({
    customerId: customer.id,
    ipAddress: getClientIp({ headers: hdrs } as unknown as Request),
    action: "APPLICATION_CREATE",
    targetType: "applications",
    targetId: application.id,
    after: { applicationNo: application.applicationNo, totalAmount: fees.totalAmount },
  });

  return {
    success: true,
    clientSecret: paymentIntent.client_secret!,
    applicationId: application.id,
  };
}

const confirmPaymentSchema = z.object({
  applicationId: z.string().min(1),
  paymentIntentId: z.string().min(1),
});

export async function confirmApplicationPayment(
  input: z.infer<typeof confirmPaymentSchema>
): Promise<{ success: boolean; error?: string; status?: string }> {
  const customer = await getCustomerSession();
  if (!customer) return { success: false, error: "ログインが必要です" };

  const parsed = confirmPaymentSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "決済情報を確認してください" };

  const application = await prisma.application.findFirst({
    where: { id: parsed.data.applicationId, customerId: customer.id },
    include: { payments: true },
  });
  if (!application) return { success: false, error: "申込が見つかりません" };

  const payment = application.payments.find(
    (p) => p.stripePaymentIntentId === parsed.data.paymentIntentId
  );
  if (!payment) return { success: false, error: "決済レコードが見つかりません" };
  if (payment.status === "SUCCEEDED") {
    return { success: true, status: "succeeded" };
  }

  const stripe = getStripe();
  const paymentIntent = await stripe.paymentIntents.retrieve(parsed.data.paymentIntentId, {
    expand: ["payment_method"],
  });

  if (paymentIntent.status !== "succeeded") {
    if (paymentIntent.status === "processing") {
      return { success: false, status: "processing", error: "決済処理中です。少し待ってから予約へ進んでください" };
    }
    return { success: false, status: paymentIntent.status, error: "決済が完了していません" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "SUCCEEDED",
        stripePaymentMethodId:
          typeof paymentIntent.payment_method === "string"
            ? paymentIntent.payment_method
            : paymentIntent.payment_method?.id,
        paidAt: new Date(),
      },
    });

    await tx.application.update({
      where: { id: application.id },
      data: { status: "SUBMITTED", submittedAt: application.submittedAt ?? new Date() },
    });

    await tx.card.updateMany({
      where: { applicationId: application.id },
      data: { status: "SUBMITTED_BY_CUSTOMER" },
    });
  });

  const paymentMethod = paymentIntent.payment_method;
  if (
    typeof paymentMethod === "object" &&
    paymentMethod?.id &&
    paymentMethod.card &&
    customer.stripeCustomerId
  ) {
    const existing = await prisma.savedPaymentMethod.findFirst({
      where: { stripePaymentMethodId: paymentMethod.id },
    });
    if (!existing) {
      const hasDefault = await prisma.savedPaymentMethod.findFirst({
        where: { customerId: customer.id, isDefault: true },
      });
      await prisma.savedPaymentMethod.create({
        data: {
          customerId: customer.id,
          stripePaymentMethodId: paymentMethod.id,
          brand: paymentMethod.card.brand,
          last4: paymentMethod.card.last4,
          expMonth: paymentMethod.card.exp_month,
          expYear: paymentMethod.card.exp_year,
          isDefault: !hasDefault,
        },
      });
    }
  }

  const hdrs = await headers();
  await logOperation({
    customerId: customer.id,
    ipAddress: getClientIp({ headers: hdrs } as unknown as Request),
    action: "APPLICATION_PAYMENT_CONFIRMED",
    targetType: "applications",
    targetId: application.id,
    after: { paymentIntentId: paymentIntent.id, status: paymentIntent.status },
  });

  // 申込受付メール（best-effort・SMTP未設定/無効なら送信されない）
  await sendTemplate("application_received", customer.email, {
    name: decrypt(customer.nameEncrypted),
    applicationNo: application.applicationNo,
    amount: formatMoney(application.totalAmount, application.region),
  });

  revalidatePath("/mypage");
  revalidatePath("/mypage/submission-booking");
  revalidatePath(`/mypage/applications/${application.id}`);
  return { success: true, status: paymentIntent.status };
}

const storeRequestSchema = z.object({
  region: z.nativeEnum(ServiceRegion),
  serviceLevel: z.nativeEnum(ServiceLevel),
  cardCount: z.number().int().min(1).max(500),
  returnMethod: z.nativeEnum(ReturnMethod),
  returnAddress: returnAddressSchema,
  shippingPhone: z.string().regex(/^[0-9-+() ]{10,20}$/),
  agreementText: z.string().min(1),
  agreementVersion: z.string().min(1),
  ipAddress: z.string(),
  userAgent: z.string().optional(),
});

/**
 * 代理申込（当社入力）の依頼を顧客が作成し、概算（枚数×鑑定料＋税）を先払いする。ADR-0020 / PROXY_PREPAY
 * カード明細は入れず、サービスレベル・枚数・提出先・返却方法・同意のみ。先払い決済後にカードお預け予約へ進む。
 * 店舗到着後にスタッフが明細を確定し、差額は段階4で追加請求（本実装の対象外）。
 * 返り値の clientSecret で顧客がカード決済し、confirmStorePrepayPayment で確定する。
 */
export async function createStoreRequest(
  input: z.infer<typeof storeRequestSchema>
): Promise<{ success: boolean; error?: string; applicationId?: string; clientSecret?: string }> {
  const customer = await getCustomerSession();
  if (!customer) return { success: false, error: "ログインが必要です" };

  const parsed = storeRequestSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "入力内容が正しくありません" };

  const servicePrice = await prisma.servicePrice.findUnique({
    where: { serviceLevel_region: { serviceLevel: parsed.data.serviceLevel, region: parsed.data.region } },
  });
  if (!servicePrice) return { success: false, error: "サービスレベルが見つかりません" };

  // 先払い概算: 枚数 × 鑑定料 ＋ 消費税(10%)。代理入力料金・送料・保険・事務手数料は含めない（差額側＝段階4）。
  const psaFeeTotal = servicePrice.pricePerCard * parsed.data.cardCount;
  const taxAmount = Math.floor(psaFeeTotal * 0.1);
  const prepaidAmount = psaFeeTotal + taxAmount;

  let stripeCustomerId: string;
  try {
    stripeCustomerId = await ensureStripeCustomer(customer);
  } catch (err) {
    console.error("Failed to ensure Stripe customer:", err);
    return { success: false, error: paymentSetupErrorMessage(err) };
  }

  const applicationNo = await generateApplicationNo("STORE");

  const application = await prisma.$transaction(async (tx) => {
    const app = await tx.application.create({
      data: {
        applicationNo,
        customerId: customer.id,
        serviceLevel: parsed.data.serviceLevel, // 顧客選択（店舗が明細確定時に再確定しうる）
        region: parsed.data.region,
        source: "STORE",
        returnMethod: parsed.data.returnMethod,
        shippingAddressEncrypted: encrypt(JSON.stringify(parsed.data.returnAddress)),
        shippingPhoneEncrypted: encrypt(parsed.data.shippingPhone),
        status: "DRAFT",
        estimatedCardCount: parsed.data.cardCount,
        prepaidAmount,
        totalAmount: prepaidAmount,
        psaFeeTotal,
        taxAmount,
      },
    });
    await tx.agreement.create({
      data: {
        customerId: customer.id,
        applicationId: app.id,
        ipAddress: parsed.data.ipAddress,
        userAgent: parsed.data.userAgent,
        agreementText: parsed.data.agreementText,
        version: parsed.data.agreementVersion,
      },
    });
    return app;
  });

  // Stripe PaymentIntent（概算先払い）
  let paymentIntent;
  try {
    paymentIntent = await createPaymentIntent({
      amount: prepaidAmount,
      customerId: stripeCustomerId,
      applicationId: application.id,
      description: `PSA代理申込 先払い ${application.applicationNo}`,
    });
  } catch (err) {
    console.error("Failed to create Stripe PaymentIntent:", err);
    return { success: false, error: paymentSetupErrorMessage(err) };
  }

  await prisma.payment.create({
    data: {
      customerId: customer.id,
      applicationId: application.id,
      stripePaymentIntentId: paymentIntent.id,
      amount: prepaidAmount,
      status: "PENDING",
      description: `PSA代理申込 先払い ${application.applicationNo}`,
    },
  });

  const hdrs = await headers();
  await logOperation({
    customerId: customer.id,
    ipAddress: getClientIp({ headers: hdrs } as unknown as Request),
    action: "STORE_REQUEST_CREATE",
    targetType: "applications",
    targetId: application.id,
    after: { applicationNo: application.applicationNo, prepaidAmount },
  });

  return { success: true, applicationId: application.id, clientSecret: paymentIntent.client_secret! };
}

/**
 * 代理申込の先払い決済を確定する。confirmApplicationPayment を踏襲しつつ、
 * カード未入力のため status は DRAFT のまま（スタッフ明細入力で SUBMITTED に進む）。ADR-0020
 */
export async function confirmStorePrepayPayment(
  input: z.infer<typeof confirmPaymentSchema>
): Promise<{ success: boolean; error?: string; status?: string }> {
  const customer = await getCustomerSession();
  if (!customer) return { success: false, error: "ログインが必要です" };

  const parsed = confirmPaymentSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "決済情報を確認してください" };

  const application = await prisma.application.findFirst({
    where: { id: parsed.data.applicationId, customerId: customer.id, source: "STORE" },
    include: { payments: true },
  });
  if (!application) return { success: false, error: "申込が見つかりません" };

  const payment = application.payments.find(
    (p) => p.stripePaymentIntentId === parsed.data.paymentIntentId
  );
  if (!payment) return { success: false, error: "決済レコードが見つかりません" };
  if (payment.status === "SUCCEEDED") {
    return { success: true, status: "succeeded" };
  }

  const stripe = getStripe();
  const paymentIntent = await stripe.paymentIntents.retrieve(parsed.data.paymentIntentId, {
    expand: ["payment_method"],
  });

  if (paymentIntent.status !== "succeeded") {
    if (paymentIntent.status === "processing") {
      return { success: false, status: "processing", error: "決済処理中です。少し待ってから予約へ進んでください" };
    }
    return { success: false, status: paymentIntent.status, error: "決済が完了していません" };
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: "SUCCEEDED",
      stripePaymentMethodId:
        typeof paymentIntent.payment_method === "string"
          ? paymentIntent.payment_method
          : paymentIntent.payment_method?.id,
      paidAt: new Date(),
    },
  });

  // 保存カード登録（段階4の差額オフセッション課金に流用可）
  const paymentMethod = paymentIntent.payment_method;
  if (
    typeof paymentMethod === "object" &&
    paymentMethod?.id &&
    paymentMethod.card &&
    customer.stripeCustomerId
  ) {
    const existing = await prisma.savedPaymentMethod.findFirst({
      where: { stripePaymentMethodId: paymentMethod.id },
    });
    if (!existing) {
      const hasDefault = await prisma.savedPaymentMethod.findFirst({
        where: { customerId: customer.id, isDefault: true },
      });
      await prisma.savedPaymentMethod.create({
        data: {
          customerId: customer.id,
          stripePaymentMethodId: paymentMethod.id,
          brand: paymentMethod.card.brand,
          last4: paymentMethod.card.last4,
          expMonth: paymentMethod.card.exp_month,
          expYear: paymentMethod.card.exp_year,
          isDefault: !hasDefault,
        },
      });
    }
  }

  const hdrs = await headers();
  await logOperation({
    customerId: customer.id,
    ipAddress: getClientIp({ headers: hdrs } as unknown as Request),
    action: "STORE_PREPAY_CONFIRMED",
    targetType: "applications",
    targetId: application.id,
    after: { paymentIntentId: paymentIntent.id, status: paymentIntent.status },
  });

  // 受付メール（best-effort）
  await sendTemplate("application_received", customer.email, {
    name: decrypt(customer.nameEncrypted),
    applicationNo: application.applicationNo,
    amount: formatMoney(application.totalAmount, application.region),
  });

  revalidatePath("/mypage");
  revalidatePath("/mypage/submission-booking");
  return { success: true, status: paymentIntent.status };
}

const draftCardSchema = z.object({
  tcgTitle: z.string().default(""),
  releaseYear: z.string().default(""),
  cardNumber: z.string().default(""),
  cardName: z.string().default(""),
  rarity: z.string().default(""),
  language: z.nativeEnum(CardLanguage).default("JAPANESE"),
  quantity: z.number().int().default(1),
  declaredValue: z.number().int().default(0),
});

const saveDraftSchema = z.object({
  draftId: z.string().optional(),
  serviceLevel: z.nativeEnum(ServiceLevel),
  region: z.nativeEnum(ServiceRegion),
  returnMethod: z.nativeEnum(ReturnMethod),
  returnSel: z.string().default("registered"),
  cards: z.array(draftCardSchema).default([]),
});

export type DraftData = {
  cards: z.infer<typeof draftCardSchema>[];
  returnSel: string;
};

/** 申込を下書き保存（サーバー側）。決済は行わない。既存draftIdがあれば上書き。 */
export async function saveDraft(
  input: z.infer<typeof saveDraftSchema>
): Promise<{ success: boolean; error?: string; draftId?: string }> {
  const customer = await getCustomerSession();
  if (!customer) return { success: false, error: "ログインが必要です" };

  const parsed = saveDraftSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "入力内容が正しくありません" };

  const draftData = { cards: parsed.data.cards, returnSel: parsed.data.returnSel };

  if (parsed.data.draftId) {
    const owned = await prisma.application.findFirst({
      where: { id: parsed.data.draftId, customerId: customer.id, status: "DRAFT" },
    });
    if (!owned) return { success: false, error: "下書きが見つかりません" };
    await prisma.application.update({
      where: { id: owned.id },
      data: {
        serviceLevel: parsed.data.serviceLevel,
        region: parsed.data.region,
        returnMethod: parsed.data.returnMethod,
        draftData,
      },
    });
    revalidatePath("/mypage");
    revalidatePath("/mypage/applications");
    return { success: true, draftId: owned.id };
  }

  const applicationNo = await generateApplicationNo();
  const app = await prisma.application.create({
    data: {
      applicationNo,
      customerId: customer.id,
      serviceLevel: parsed.data.serviceLevel,
      region: parsed.data.region,
      source: "CUSTOMER",
      returnMethod: parsed.data.returnMethod,
      status: "DRAFT",
      draftData,
    },
  });
  revalidatePath("/mypage");
  revalidatePath("/mypage/applications");
  return { success: true, draftId: app.id };
}

/** 下書きの内容を取得（再開用） */
export async function getDraft(id: string): Promise<{
  draftId: string;
  serviceLevel: ServiceLevel;
  region: ServiceRegion;
  returnMethod: ReturnMethod;
  cards: z.infer<typeof draftCardSchema>[];
  returnSel: string;
} | null> {
  const customer = await getCustomerSession();
  if (!customer) return null;
  const app = await prisma.application.findFirst({
    where: { id, customerId: customer.id, status: "DRAFT", source: "CUSTOMER" },
  });
  if (!app) return null;
  const data = (app.draftData as DraftData | null) ?? { cards: [], returnSel: "registered" };
  return {
    draftId: app.id,
    serviceLevel: app.serviceLevel,
    region: app.region,
    returnMethod: app.returnMethod,
    cards: data.cards ?? [],
    returnSel: data.returnSel ?? "registered",
  };
}

/** 下書き(DRAFT)の申込を削除する（本人のもののみ） */
export async function deleteApplication(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const customer = await getCustomerSession();
  if (!customer) return { success: false, error: "ログインが必要です" };

  const app = await prisma.application.findFirst({ where: { id, customerId: customer.id } });
  if (!app) return { success: false, error: "申込が見つかりません" };
  if (app.status !== "DRAFT") return { success: false, error: "提出済みの申込は削除できません" };

  await prisma.$transaction([
    prisma.card.deleteMany({ where: { applicationId: id } }),
    prisma.payment.deleteMany({ where: { applicationId: id } }),
    prisma.agreement.deleteMany({ where: { applicationId: id } }),
    prisma.application.delete({ where: { id } }),
  ]);

  revalidatePath("/mypage/applications");
  return { success: true };
}

/** 申込フォームのプレビュー用: サーバーと同じ計算式で料金内訳を返す（顧客入力=代理料金なし） */
export async function previewFees(input: {
  serviceLevel: ServiceLevel | null;
  region: ServiceRegion;
  returnMethod: ReturnMethod;
  cardCount: number;
  totalDeclaredValue: number;
}) {
  if (!input.serviceLevel) return null;
  const customer = await getCustomerSession();
  try {
    return await calculateFees({
      serviceLevel: input.serviceLevel,
      region: input.region,
      returnMethod: input.returnMethod,
      cardCount: input.cardCount,
      totalDeclaredValue: input.totalDeclaredValue,
      applyAgencyFee: false,
      customerId: customer?.id,
    });
  } catch {
    return null;
  }
}

export async function getMyApplications() {
  const customer = await getCustomerSession();
  if (!customer) return [];

  return prisma.application.findMany({
    where: { customerId: customer.id },
    include: {
      cards: {
        select: { id: true, cardName: true, status: true, psaGrade: true, psaCertNo: true },
      },
      payments: { select: { status: true, amount: true, paidAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getApplicationDetail(applicationId: string) {
  const customer = await getCustomerSession();
  if (!customer) return null;

  return prisma.application.findFirst({
    where: { id: applicationId, customerId: customer.id },
    include: {
      cards: { include: { statusHistory: { orderBy: { changedAt: "desc" } } } },
      payments: true,
      agreement: true,
      submissionBooking: true,
    },
  });
}
