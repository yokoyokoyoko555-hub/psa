"use server";

import { prisma } from "@/lib/prisma";
import { getCustomerSession } from "@/lib/customer-auth";
import { decrypt, encrypt } from "@/lib/crypto";
import { calculateFees } from "@/lib/fee-calculator";
import { generateApplicationNo, generateCardNo } from "@/lib/number-generator";
import { createCustomer as createStripeCustomer, createPaymentIntent, getStripe } from "@/lib/stripe";
import { sendTemplate } from "@/lib/mailer";
import { formatMoneyIn, formatMoneyInt, roundMoney, stripeCurrency, toStripeAmount } from "@/lib/currency";
import { logOperation, getClientIp } from "@/lib/operation-log";
import { pricingSettingId } from "@/lib/pricing-setting-id";
import { ServiceRegion, ItemType, ReturnMethod, Prisma } from "@prisma/client";
import { z } from "zod";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

const cardSchema = z.object({
  tcgTitle: z.string().min(1).max(200),
  // 発行年（トレカ/パック）または発行年月の自由記述（コミック・マガジン）。範囲チェックはitemType確定後にcreateApplication内で行う。ADR-0033
  releaseYear: z.string().max(20).optional(),
  cardName: z.string().min(1).max(200),
  cardNumber: z.string().max(100).optional(),
  rarity: z.string().max(100).optional(),
  // 空欄可（未入力時は「日本語」を補完。コミック・マガジンでは出版社として使用）。ADR-0033
  language: z.string().max(50).optional().transform((v) => (v && v.trim() ? v.trim() : "日本語")),
  declaredValue: z.number().int().min(1),
  quantity: z.number().int().min(1).max(100),
  frontImageKey: z.string().optional(),
  backImageKey: z.string().optional(),
  damageImageKeys: z.array(z.string()).default([]),
  notes: z.string().max(1000).optional(),
  // カードごとに選択したCustomServicePrice.id（自己入力でも複数サービスレベルにまたがる申込に対応）。ADR-0076
  customServiceLevelId: z.string().min(1),
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
  region: z.nativeEnum(ServiceRegion),
  itemType: z.nativeEnum(ItemType).default("TRADING_CARD"), // PSA_JPは常にTRADING_CARDへサーバー側で補正。ADR-0023
  // カードごとにcustomServiceLevelIdを持つため、申込単位のものは初期選択の参考値（下書き復元用）。ADR-0076
  customServiceLevelId: z.string().optional(),
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

  // PSA_JPは常にTRADING_CARD（クライアント値を信用しない）。ADR-0023
  const itemType: ItemType = parsed.data.region === "PSA_JP" ? "TRADING_CARD" : parsed.data.itemType;
  const isAutographEligible = parsed.data.region === "PSA_US" && itemType === "TRADING_CARD";

  // 全itemType（トレカ含む）がCustomServicePrice（管理画面でCRUD可能な動的タイア）を参照する。ADR-0025/0026
  // PSA_US×TRADING_CARDのみ、通常タイアに加えデュアルサービス(category=AUTOGRAPH)タイアも選択可能
  // （通常サービスの代わりに選ぶ形式・追加料金にはしない）。ADR-0029
  const categoryCandidates: ("TRADING_CARD" | "UNOPENED_PACK" | "COMIC_MAGAZINE" | "AUTOGRAPH")[] = isAutographEligible
    ? [itemType, "AUTOGRAPH"]
    : [itemType];

  const cardsInput = parsed.data.cards;

  // カードごとに異なるサービスレベルを持ちうるため（自己入力でも複数レベルにまたがる申込に対応。ADR-0076）、
  // 参照される全タイアをまとめて取得する。代理入力と同じ考え方。ADR-0038
  const tierIds = [...new Set(cardsInput.map((c) => c.customServiceLevelId))];
  const prices = await prisma.customServicePrice.findMany({
    where: { id: { in: tierIds }, category: { in: categoryCandidates }, region: parsed.data.region, isActive: true },
  });
  const priceMap = new Map(prices.map((p) => [p.id, p]));
  if (priceMap.size !== tierIds.length) return { success: false, error: "サービスが見つかりません" };

  // Application用のサービスレベルsnapshot: 単一タイアのみならそのid/name、複数タイアにまたがる場合はidをnullにし名称を連結する。ADR-0038/0076
  const snapshotServiceLevelId = tierIds.length === 1 ? (tierIds[0] ?? null) : null;
  const snapshotServiceLevelName = tierIds.map((id) => priceMap.get(id)!.name).join(" / ");

  // 発行年は「トレカ／未開封パック」のみ1900〜2100の数値を要求。コミック・マガジンは発行年月の自由記述を許可。ADR-0033
  if (itemType !== "COMIC_MAGAZINE") {
    const badYear = cardsInput.find((c) => {
      if (!c.releaseYear || !c.releaseYear.trim()) return false;
      const y = parseInt(c.releaseYear, 10);
      return !Number.isInteger(y) || y < 1900 || y > 2100 || String(y) !== c.releaseYear.trim();
    });
    if (badYear) {
      return { success: false, error: "発行年は1900〜2100の範囲で入力してください（空欄でも構いません）" };
    }
  }

  // 申告価格上限は各カードが選択したタイアの上限と比較する。ADR-0038/0076
  for (const c of cardsInput) {
    const price = priceMap.get(c.customServiceLevelId)!;
    if (price.maxDeclaredValue !== null && c.declaredValue > price.maxDeclaredValue) {
      return {
        success: false,
        error: `このサービスの申告価格上限（${formatMoneyInt(price.maxDeclaredValue, parsed.data.region)}）を超えるカードがあります（${c.cardName || "無題"}: ${formatMoneyInt(c.declaredValue, parsed.data.region)}）。上位のサービスを選択してください。`,
      };
    }
  }

  const totalDeclaredValue = cardsInput.reduce(
    (sum, c) => sum + c.declaredValue * c.quantity,
    0
  );
  const cardCount = cardsInput.reduce((sum, c) => sum + c.quantity, 0);

  // 顧客自身の申込は手数料なし（当社入力=STORE は管理画面の代理申込で別途）
  let fees;
  try {
    fees = await calculateFees({
      region: parsed.data.region,
      itemType,
      returnMethod: parsed.data.returnMethod,
      cardCount,
      totalDeclaredValue,
      applyAgencyFee: false,
      customerId: customer.id,
      cardServiceLevels: cardsInput.map((c) => ({ customServiceLevelId: c.customServiceLevelId, quantity: c.quantity })),
    });
  } catch (err) {
    console.error("Failed to calculate fees:", err);
    return { success: false, error: err instanceof Error ? err.message : "料金の計算に失敗しました" };
  }

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

  let application;
  try {
    application = await prisma.$transaction(async (tx) => {
    const commonData = {
      serviceLevel: "CUSTOM" as const,
      region: parsed.data.region,
      itemType,
      customServiceLevelId: snapshotServiceLevelId,
      customServiceLevelName: snapshotServiceLevelName,
      source: "CUSTOMER" as const,
      returnMethod: parsed.data.returnMethod,
      shippingAddressEncrypted: parsed.data.returnAddress
        ? encrypt(JSON.stringify(parsed.data.returnAddress))
        : null,
      shippingPhoneEncrypted: encrypt(parsed.data.shippingPhone),
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
    // 原価: 明示設定があればそれを、未設定(0)なら鑑定料×80%で代替（全itemType共通。ADR-0026）。
    // カードごとに選択したタイアで価格を計算する（自己入力でも複数レベルにまたがる申込に対応）。ADR-0038/0076
    for (const [i, cardInput] of cardsInput.entries()) {
      const price = priceMap.get(cardInput.customServiceLevelId)!;
      const isDualService = price.category === "AUTOGRAPH";
      const cardNo = await generateCardNo(tx);
      const psaFee = price.pricePerCard * cardInput.quantity;
      const perCardCost = price.cost > 0 ? price.cost : roundMoney(price.pricePerCard * 0.8, parsed.data.region);
      const psaCost = perCardCost * cardInput.quantity;
      const agencyFee = 0; // 顧客入力は手数料なし

      await tx.card.create({
        data: {
          customerId: customer.id,
          applicationId: app.id,
          cardNo,
          lineNo: i + 1,
          tcgTitle: cardInput.tcgTitle,
          releaseYear: cardInput.releaseYear,
          cardName: cardInput.cardName,
          cardNumber: cardInput.cardNumber,
          rarity: cardInput.rarity,
          language: cardInput.language,
          declaredValue: cardInput.declaredValue,
          quantity: cardInput.quantity,
          customServiceLevelId: price.id,
          customServiceLevelName: price.name,
          frontImageKey: cardInput.frontImageKey,
          backImageKey: cardInput.backImageKey,
          damageImageKeys: cardInput.damageImageKeys,
          notes: cardInput.notes,
          psaFee,
          psaCost,
          agencyFee,
          // デュアルサービスは通常サービスの代わりに選ぶ形式のため追加料金は発生しない（0固定）。ADR-0029
          autographRequested: isDualService,
          autographFee: 0,
          autographCost: 0,
          autographCustomServiceLevelId: isDualService ? price.id : null,
          autographCustomServiceLevelName: isDualService ? price.name : null,
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
  } catch (err) {
    console.error("Failed to create application/cards:", err);
    return { success: false, error: "申込データの保存に失敗しました。入力内容をご確認のうえ、時間をおいて再度お試しください。" };
  }

  // Stripe PaymentIntent作成
  let paymentIntent;
  try {
    paymentIntent = await createPaymentIntent({
      amount: toStripeAmount(fees.totalAmount),
      currency: stripeCurrency(),
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
      currency: stripeCurrency(),
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
  });

  const paymentMethod = paymentIntent.payment_method;
  if (
    typeof paymentMethod === "object" &&
    paymentMethod?.id &&
    paymentMethod.card &&
    customer.stripeCustomerId
  ) {
    // 同一カード（ブランド・下4桁・有効期限が一致）は重複保存しない。ADR-0048
    const existing = await prisma.savedPaymentMethod.findFirst({
      where: {
        customerId: customer.id,
        brand: paymentMethod.card.brand,
        last4: paymentMethod.card.last4,
        expMonth: paymentMethod.card.exp_month,
        expYear: paymentMethod.card.exp_year,
      },
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
    amount: formatMoneyIn(application.totalAmount, "JPY"),
  });

  revalidatePath("/mypage");
  revalidatePath("/mypage/submission-booking");
  revalidatePath(`/mypage/applications/${application.id}`);
  return { success: true, status: paymentIntent.status };
}

const storeRequestSchema = z.object({
  region: z.nativeEnum(ServiceRegion),
  itemType: z.nativeEnum(ItemType).default("TRADING_CARD"), // PSA_JPは常にTRADING_CARDへサーバー側で補正。ADR-0023
  // 代理入力数（同一カードは1としてカウント）。実際のサービスレベル・鑑定料は
  // カードお預け後にスタッフが明細を確定し、別途メールで請求する（このステップでは選択しない）。ADR-0026
  agencyQuantity: z.number().int().min(1).max(500),
  // 申込総数（あくまで当社の総量把握のための参考値。料金計算には使わない）。ADR-0037
  estimatedTotalCount: z.number().int().min(1).max(5000),
  returnMethod: z.nativeEnum(ReturnMethod),
  returnAddress: returnAddressSchema,
  shippingPhone: z.string().regex(/^[0-9-+() ]{10,20}$/),
  agreementText: z.string().min(1),
  agreementVersion: z.string().min(1),
  ipAddress: z.string(),
  userAgent: z.string().optional(),
});

/**
 * 代理申込（当社入力）の依頼を顧客が作成し、代理入力費用（代理入力数×代理入力料。内税）を先払いする。
 * ADR-0020 / ADR-0026
 * 事務手数料はここでは請求しない（サービス単位×事務手数料のため、実際のサービスレベルが確定する
 * completeStoreApplication 側で計算・請求する）。
 * カード明細・サービスレベルは入れず、代理入力数・提出先・返却方法・同意のみ。先払い決済後にカードお預け予約へ進む。
 * 店舗到着後にスタッフが明細・サービスレベルを確定し、鑑定料・事務手数料は別途メールで請求する（本実装の対象外）。
 * 返り値の clientSecret で顧客がカード決済し、confirmStorePrepayPayment で確定する。
 */
export async function createStoreRequest(
  input: z.infer<typeof storeRequestSchema>
): Promise<{ success: boolean; error?: string; applicationId?: string; clientSecret?: string }> {
  const customer = await getCustomerSession();
  if (!customer) return { success: false, error: "ログインが必要です" };

  const parsed = storeRequestSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "入力内容が正しくありません" };

  // PSA_JPは常にTRADING_CARD（クライアント値を信用しない）。ADR-0023
  const itemType: ItemType = parsed.data.region === "PSA_JP" ? "TRADING_CARD" : parsed.data.itemType;

  const setting = await prisma.pricingSetting.findUnique({ where: { id: pricingSettingId(parsed.data.region, itemType) } });
  const agencyFeeTotal = (setting?.proxyFee ?? 0) * parsed.data.agencyQuantity;
  // 代理入力費用は内税（消費税を別途加算しない）。事務手数料はサービス単位で後日課金するためここには含めない。
  const prepaidAmount = agencyFeeTotal;

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
        serviceLevel: "CUSTOM", // 実際のサービスレベルはスタッフが明細確定時に選択。ADR-0026
        region: parsed.data.region,
        itemType,
        source: "STORE",
        returnMethod: parsed.data.returnMethod,
        shippingAddressEncrypted: encrypt(JSON.stringify(parsed.data.returnAddress)),
        shippingPhoneEncrypted: encrypt(parsed.data.shippingPhone),
        status: "DRAFT",
        estimatedCardCount: parsed.data.estimatedTotalCount,
        agencyQuantity: parsed.data.agencyQuantity,
        agencyFeeTotal,
        prepaidAmount,
        totalAmount: prepaidAmount,
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

  // Stripe PaymentIntent（代理入力費用の先払い）
  let paymentIntent;
  try {
    paymentIntent = await createPaymentIntent({
      amount: toStripeAmount(prepaidAmount),
      currency: stripeCurrency(),
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
      currency: stripeCurrency(),
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
    after: { applicationNo: application.applicationNo, prepaidAmount, agencyQuantity: parsed.data.agencyQuantity },
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
    // 同一カード（ブランド・下4桁・有効期限が一致）は重複保存しない。ADR-0048
    const existing = await prisma.savedPaymentMethod.findFirst({
      where: {
        customerId: customer.id,
        brand: paymentMethod.card.brand,
        last4: paymentMethod.card.last4,
        expMonth: paymentMethod.card.exp_month,
        expYear: paymentMethod.card.exp_year,
      },
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
    amount: formatMoneyIn(application.totalAmount, "JPY"),
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
  language: z.string().default(""), // 初期値は空欄（ADR-0033）。確定時にcardSchemaで「日本語」を補完
  quantity: z.number().int().default(0), // 初期値は空欄（ADR-0033）
  declaredValue: z.number().int().default(0),
  customServiceLevelId: z.string().default(""), // カードごとのサービスレベル。ADR-0076
});

const saveDraftSchema = z.object({
  draftId: z.string().optional(),
  region: z.nativeEnum(ServiceRegion),
  itemType: z.nativeEnum(ItemType).default("TRADING_CARD"),
  customServiceLevelId: z.string().optional(),
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
        serviceLevel: "CUSTOM",
        region: parsed.data.region,
        itemType: parsed.data.region === "PSA_JP" ? "TRADING_CARD" : parsed.data.itemType,
        customServiceLevelId: parsed.data.customServiceLevelId,
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
      serviceLevel: "CUSTOM",
      region: parsed.data.region,
      itemType: parsed.data.region === "PSA_JP" ? "TRADING_CARD" : parsed.data.itemType,
      customServiceLevelId: parsed.data.customServiceLevelId,
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
  region: ServiceRegion;
  itemType: ItemType;
  customServiceLevelId: string | null;
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
    region: app.region,
    itemType: app.itemType,
    customServiceLevelId: app.customServiceLevelId,
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

/** 申込フォームのプレビュー用: サーバーと同じ計算式で料金内訳を返す（顧客入力=代理料金なし）。ADR-0076 */
export async function previewFees(input: {
  region: ServiceRegion;
  itemType: ItemType;
  cardServiceLevels: { customServiceLevelId: string; quantity: number }[];
  returnMethod: ReturnMethod;
  cardCount: number;
  totalDeclaredValue: number;
}) {
  const itemType = input.region === "PSA_JP" ? "TRADING_CARD" : input.itemType;
  if (input.cardServiceLevels.length === 0) return null;
  const customer = await getCustomerSession();
  try {
    return await calculateFees({
      region: input.region,
      itemType,
      returnMethod: input.returnMethod,
      cardCount: input.cardCount,
      totalDeclaredValue: input.totalDeclaredValue,
      applyAgencyFee: false,
      customerId: customer?.id,
      cardServiceLevels: input.cardServiceLevels,
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
      psaSubmissionGroup: {
        select: { status: true, submittedAt: true, returnReadyAt: true, returnedAt: true, customServiceLevelName: true },
      },
      // カード単位（サービスレベル別）のグループにまたがる場合の追加所属。ADR-0076
      groupMemberships: {
        include: {
          psaSubmissionGroup: {
            select: { status: true, submittedAt: true, returnReadyAt: true, returnedAt: true, customServiceLevelName: true },
          },
        },
      },
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
      cards: { orderBy: { lineNo: "asc" } },
      payments: true,
      agreement: true,
      submissionBooking: true,
      psaSubmissionGroup: {
        select: { status: true, submittedAt: true, returnReadyAt: true, returnedAt: true, customServiceLevelName: true },
      },
      // カード単位（サービスレベル別）のグループにまたがる場合の追加所属。ADR-0076
      groupMemberships: {
        include: {
          psaSubmissionGroup: {
            select: { status: true, submittedAt: true, returnReadyAt: true, returnedAt: true, customServiceLevelName: true },
          },
        },
      },
    },
  });
}
