"use server";

import { prisma } from "@/lib/prisma";
import { getCustomerSession } from "@/lib/customer-auth";
import { encrypt } from "@/lib/crypto";
import { calculateFees } from "@/lib/fee-calculator";
import { generateApplicationNo, generateCardNo } from "@/lib/number-generator";
import { createPaymentIntent } from "@/lib/stripe";
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

export async function createApplication(
  input: ApplicationInput
): Promise<{ success: boolean; clientSecret?: string; applicationId?: string; error?: string }> {
  const customer = await getCustomerSession();
  if (!customer) return { success: false, error: "ログインが必要です" };

  const parsed = applicationSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "入力内容が正しくありません" };

  if (!customer.stripeCustomerId) {
    return { success: false, error: "Stripe顧客情報が見つかりません" };
  }

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
  });

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
      shippingFee: fees.shippingFee,
      insuranceFee: fees.insuranceFee,
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
  const paymentIntent = await createPaymentIntent({
    amount: fees.totalAmount,
    customerId: customer.stripeCustomerId,
    applicationId: application.id,
    description: `PSA申込 ${applicationNo}`,
  });

  // Payment レコード作成
  await prisma.payment.create({
    data: {
      customerId: customer.id,
      applicationId: application.id,
      stripePaymentIntentId: paymentIntent.id,
      amount: fees.totalAmount,
      status: "PENDING",
      description: `PSA申込 ${applicationNo}`,
    },
  });

  const hdrs = await headers();
  await logOperation({
    customerId: customer.id,
    ipAddress: getClientIp({ headers: hdrs } as unknown as Request),
    action: "APPLICATION_CREATE",
    targetType: "applications",
    targetId: application.id,
    after: { applicationNo, totalAmount: fees.totalAmount },
  });

  return {
    success: true,
    clientSecret: paymentIntent.client_secret!,
    applicationId: application.id,
  };
}

const storeRequestSchema = z.object({
  region: z.nativeEnum(ServiceRegion),
  returnMethod: z.nativeEnum(ReturnMethod),
  agreementText: z.string().min(1),
  agreementVersion: z.string().min(1),
  ipAddress: z.string(),
  userAgent: z.string().optional(),
});

/**
 * 代理申込（当社入力）の依頼を顧客が作成する。
 * カード明細は入れず、提出先・返却方法・同意のみ。管理画面に「要対応」(source=STORE, status=DRAFT)として表示される。
 * 料金確定と決済は店舗の入力完了時（completeStoreApplication）に行う。
 */
export async function createStoreRequest(
  input: z.infer<typeof storeRequestSchema>
): Promise<{ success: boolean; error?: string }> {
  const customer = await getCustomerSession();
  if (!customer) return { success: false, error: "ログインが必要です" };

  const parsed = storeRequestSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "入力内容が正しくありません" };

  const applicationNo = await generateApplicationNo();

  const application = await prisma.$transaction(async (tx) => {
    const app = await tx.application.create({
      data: {
        applicationNo,
        customerId: customer.id,
        serviceLevel: "REGULAR", // 仮（店舗が確定）
        region: parsed.data.region,
        source: "STORE",
        returnMethod: parsed.data.returnMethod,
        status: "DRAFT",
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

  const hdrs = await headers();
  await logOperation({
    customerId: customer.id,
    ipAddress: getClientIp({ headers: hdrs } as unknown as Request),
    action: "STORE_REQUEST_CREATE",
    targetType: "applications",
    targetId: application.id,
  });

  return { success: true };
}

const draftCardSchema = z.object({
  tcgTitle: z.string().default(""),
  releaseYear: z.string().default(""),
  cardNumber: z.string().default(""),
  cardName: z.string().default(""),
  rarity: z.string().default(""),
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
