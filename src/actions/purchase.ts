"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getCustomerSession } from "@/lib/customer-auth";
import { logOperation, getClientIp } from "@/lib/operation-log";
import { generateAgreementNo } from "@/lib/number-generator";
import { PURCHASE_TERMS_VERSION, PURCHASE_TERMS_TEXT } from "@/lib/purchase-terms";
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

/**
 * カード単位の買取申請可否判定。ADR-0087により、本人確認（アカウント単位・出品申請前必須）が
 * 未了の場合は理由の先頭で必ず案内する。
 */
export async function getPurchaseEligibility(cardId: string): Promise<{ eligible: boolean; reasons: string[] }> {
  const customer = await getCustomerSession();
  if (!customer) throw new Error("Unauthorized");

  const [me, card, existingAgreement] = await Promise.all([
    prisma.customer.findUniqueOrThrow({ where: { id: customer.id }, select: { identityVerifiedAt: true } }),
    prisma.card.findUnique({ where: { id: cardId }, include: { ownership: true } }),
    prisma.purchaseAgreement.findFirst({
      where: { cardId, status: { notIn: ["CANCELLED", "EXPIRED"] } },
    }),
  ]);

  if (!card || card.customerId !== customer.id) throw new Error("Not found");

  const reasons: string[] = [];
  if (!me.identityVerifiedAt) reasons.push("本人確認が完了していません。先に本人確認を行ってください。");
  if (card.ownership && card.ownership.status !== "CUSTOMER_OWNED") reasons.push("このカードは現在申請できる状態にありません。");
  if (existingAgreement) reasons.push("既に進行中の買取申請があります。");

  return { eligible: reasons.length === 0, reasons };
}

const requestSchema = z.object({
  cardId: z.string().min(1),
  customerDesiredPriceUsdMinor: z.number().int().positive("希望開始価格を入力してください"),
  listingDurationOptionId: z.string().min(1, "出品期間を選択してください"),
});

/** 顧客による買取申請（希望開始価格・出品期間の申告）。本人確認完了が前提。ADR-0087 */
export async function requestPurchase(
  input: z.infer<typeof requestSchema>
): Promise<{ success: boolean; error?: string }> {
  const customer = await getCustomerSession();
  if (!customer) throw new Error("Unauthorized");

  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }

  const eligibility = await getPurchaseEligibility(parsed.data.cardId);
  if (!eligibility.eligible) {
    return { success: false, error: eligibility.reasons[0] };
  }

  const agreement = await prisma.$transaction(async (tx) => {
    const agreementNo = await generateAgreementNo(tx);
    return tx.purchaseAgreement.create({
      data: {
        agreementNo,
        cardId: parsed.data.cardId,
        customerId: customer.id,
        status: "UNDER_REVIEW",
        customerDesiredPriceUsdMinor: parsed.data.customerDesiredPriceUsdMinor,
        listingDurationOptionId: parsed.data.listingDurationOptionId,
      },
    });
  });

  const hdrs = await headers();
  await logOperation({
    customerId: customer.id,
    ipAddress: getClientIp({ headers: hdrs } as unknown as Request),
    action: "REQUEST_PURCHASE",
    targetType: "purchase_agreements",
    targetId: agreement.id,
  });

  revalidatePath(`/mypage/ebay/cards/${parsed.data.cardId}`);
  revalidatePath("/admin/ebay/agreements");

  return { success: true };
}

/** 買取契約の管理画面一覧。ADR-0087 */
export async function getAllPurchaseAgreements() {
  await requireAdminOrStaff();
  return prisma.purchaseAgreement.findMany({
    include: { card: true, customer: true, listingDurationOption: true },
    orderBy: { createdAt: "desc" },
  });
}

const reviewSchema = z.object({
  agreementId: z.string().min(1),
  startingPriceUsdMinor: z.number().int().nonnegative(),
  reservePriceUsdMinor: z.number().int().nonnegative().nullable(),
});

/** ADMIN/STAFFによる買取申請の審査（開始価格・予約価格の提示）。ADR-0087 */
export async function reviewPurchaseAgreement(
  input: z.infer<typeof reviewSchema>
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdminOrStaff();
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }

  const agreement = await prisma.purchaseAgreement.findUnique({ where: { id: parsed.data.agreementId } });
  if (!agreement) return { success: false, error: "申請が見つかりません" };
  if (agreement.status !== "UNDER_REVIEW") return { success: false, error: "この申請は審査待ち状態ではありません" };

  await prisma.purchaseAgreement.update({
    where: { id: agreement.id },
    data: {
      startingPriceUsdMinor: parsed.data.startingPriceUsdMinor,
      reservePriceUsdMinor: parsed.data.reservePriceUsdMinor,
      status: "AWAITING_CUSTOMER_AGREEMENT",
      approvedBy: user.id,
      approvedAt: new Date(),
    },
  });

  const hdrs = await headers();
  await logOperation({
    userId: user.id,
    ipAddress: getClientIp({ headers: hdrs } as unknown as Request),
    action: "REVIEW_PURCHASE_AGREEMENT",
    targetType: "purchase_agreements",
    targetId: agreement.id,
  });

  revalidatePath("/admin/ebay/agreements");
  revalidatePath(`/mypage/ebay/cards/${agreement.cardId}`);

  return { success: true };
}

/**
 * 顧客による買取契約への電子同意。所有権をPURCHASE_RESERVEDへ遷移させ、
 * 契約条件（バージョン・本文スナップショット）とIP/UAを証跡として記録する。ADR-0087
 */
export async function agreePurchaseAgreement(agreementId: string): Promise<{ success: boolean; error?: string }> {
  const customer = await getCustomerSession();
  if (!customer) throw new Error("Unauthorized");

  const agreement = await prisma.purchaseAgreement.findUnique({
    where: { id: agreementId },
    include: { listingDurationOption: true },
  });
  if (!agreement || agreement.customerId !== customer.id) return { success: false, error: "契約が見つかりません" };
  if (agreement.status !== "AWAITING_CUSTOMER_AGREEMENT") return { success: false, error: "同意できる状態ではありません" };

  const hdrs = await headers();
  const ip = getClientIp({ headers: hdrs } as unknown as Request);
  const userAgent = hdrs.get("user-agent") ?? undefined;
  const now = new Date();
  const days = agreement.listingDurationOption?.days ?? 7;
  const listingExpiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.purchaseAgreement.update({
      where: { id: agreement.id },
      data: {
        status: "ACTIVE",
        agreedAt: now,
        agreedIpAddress: ip,
        agreedUserAgent: userAgent,
        termsVersion: PURCHASE_TERMS_VERSION,
        termsSnapshot: PURCHASE_TERMS_TEXT,
        listingExpiresAt,
      },
    });
    await tx.cardOwnership.update({
      where: { cardId: agreement.cardId },
      data: { status: "PURCHASE_RESERVED" },
    });
    await tx.cardOwnershipHistory.create({
      data: {
        cardId: agreement.cardId,
        fromStatus: "CUSTOMER_OWNED",
        fromCustomerId: agreement.customerId,
        toStatus: "PURCHASE_RESERVED",
        toCustomerId: agreement.customerId,
        reason: "買取契約への同意成立",
        sourceType: "purchase_agreements",
        sourceId: agreement.id,
      },
    });
  });

  await logOperation({
    customerId: customer.id,
    ipAddress: ip,
    action: "AGREE_PURCHASE_AGREEMENT",
    targetType: "purchase_agreements",
    targetId: agreement.id,
  });

  revalidatePath(`/mypage/ebay/cards/${agreement.cardId}`);
  revalidatePath("/admin/ebay/agreements");

  return { success: true };
}
