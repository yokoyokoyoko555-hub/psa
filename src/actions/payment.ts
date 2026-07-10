"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCustomerSession } from "@/lib/customer-auth";
import { getStripe, createPaymentIntent } from "@/lib/stripe";
import { toStripeAmount, stripeCurrency } from "@/lib/currency";

export async function deletePaymentMethod(methodId: string) {
  const session = await getCustomerSession();
  if (!session) return { error: "Unauthorized" };

  const method = await prisma.savedPaymentMethod.findUnique({
    where: { id: methodId },
  });
  if (!method || method.customerId !== session.id) {
    return { error: "Not found" };
  }

  // Detach from Stripe
  try {
    await getStripe().paymentMethods.detach(method.stripePaymentMethodId);
  } catch {
    // proceed with DB deletion even if Stripe fails
  }

  await prisma.savedPaymentMethod.delete({ where: { id: methodId } });

  if (method.isDefault) {
    const nextMethod = await prisma.savedPaymentMethod.findFirst({
      where: { customerId: session.id },
      orderBy: { createdAt: "desc" },
    });
    if (nextMethod) {
      await prisma.savedPaymentMethod.update({
        where: { id: nextMethod.id },
        data: { isDefault: true },
      });
    }
  }

  revalidatePath("/mypage/settings");
  revalidatePath("/mypage/payment-methods");
  return { success: true };
}

/**
 * 代理申込の確定分請求（PENDING）に対し、顧客が能動的に支払うためのPaymentIntentを作成する。
 * useSavedCard=true（既定）かつ既定の保存済みカードがあればそれを事前アタッチし、クライアントは
 * confirmCardPayment(clientSecret)のみで支払える。別のカードを使いたい場合はuseSavedCard=false
 * で呼び直すことで、事前アタッチなしのPaymentIntentを取得できる。ADR-0048
 */
export async function createDifferentialPaymentIntent(applicationId: string, useSavedCard: boolean = true) {
  const customer = await getCustomerSession();
  if (!customer) return { success: false, error: "ログインが必要です" } as const;

  const application = await prisma.application.findFirst({
    where: { id: applicationId, customerId: customer.id },
  });
  if (!application) return { success: false, error: "申込が見つかりません" } as const;

  const payment = await prisma.payment.findFirst({
    where: { applicationId, customerId: customer.id, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  if (!payment) return { success: false, error: "お支払い待ちの請求が見つかりません" } as const;

  if (!customer.stripeCustomerId) {
    return { success: false, error: "決済情報の準備ができていません。サポートまでご連絡ください。" } as const;
  }

  const savedMethod = useSavedCard
    ? await prisma.savedPaymentMethod.findFirst({ where: { customerId: customer.id, isDefault: true } })
    : null;

  const pi = await createPaymentIntent({
    amount: toStripeAmount(payment.amount),
    currency: stripeCurrency(),
    customerId: customer.stripeCustomerId,
    applicationId,
    description: payment.description ?? `代理申込 確定分請求 ${application.applicationNo}`,
    paymentMethodId: savedMethod?.stripePaymentMethodId,
  });

  await prisma.payment.update({
    where: { id: payment.id },
    data: { stripePaymentIntentId: pi.id },
  });

  return {
    success: true,
    clientSecret: pi.client_secret!,
    amount: payment.amount,
    savedCard: savedMethod ? { brand: savedMethod.brand, last4: savedMethod.last4 } : null,
  } as const;
}

const confirmDifferentialPaymentSchema = z.object({
  applicationId: z.string().min(1),
  paymentIntentId: z.string().min(1),
});

/** クライアント側のconfirmCardPayment成功後、Stripe側の状態を確認してPaymentをSUCCEEDEDにする。ADR-0042 */
export async function confirmDifferentialPayment(
  input: z.infer<typeof confirmDifferentialPaymentSchema>
): Promise<{ success: boolean; error?: string }> {
  const customer = await getCustomerSession();
  if (!customer) return { success: false, error: "ログインが必要です" };

  const parsed = confirmDifferentialPaymentSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "決済情報を確認してください" };

  const application = await prisma.application.findFirst({
    where: { id: parsed.data.applicationId, customerId: customer.id },
  });
  if (!application) return { success: false, error: "申込が見つかりません" };

  const payment = await prisma.payment.findFirst({
    where: { stripePaymentIntentId: parsed.data.paymentIntentId, applicationId: application.id },
  });
  if (!payment) return { success: false, error: "決済レコードが見つかりません" };
  if (payment.status === "SUCCEEDED") return { success: true };

  const stripe = getStripe();
  const paymentIntent = await stripe.paymentIntents.retrieve(parsed.data.paymentIntentId, {
    expand: ["payment_method"],
  });

  if (paymentIntent.status !== "succeeded") {
    if (paymentIntent.status === "processing") {
      return { success: false, error: "決済処理中です。少し待ってから再度ご確認ください" };
    }
    return { success: false, error: "決済が完了していません" };
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

  const paymentMethod = paymentIntent.payment_method;
  if (typeof paymentMethod === "object" && paymentMethod?.id && paymentMethod.card && customer.stripeCustomerId) {
    // 同一カード（ブランド・下4桁・有効期限が一致）は重複保存しない。stripePaymentMethodIdだけで判定すると
    // カードを入力し直すたびに新規Stripe PaymentMethodが発行され重複するため、カード指紋で判定する。ADR-0048
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

  revalidatePath(`/mypage/applications/${application.id}`);
  return { success: true };
}

/**
 * 顧客自身の保存済みカードのうち、同一カード（ブランド・下4桁・有効期限が一致）の重複行を1件に
 * まとめる（既定カード優先、無ければ最古の1件を残す）。既存データの一括整理用。ADR-0048
 */
export async function dedupeSavedPaymentMethods() {
  const customer = await getCustomerSession();
  if (!customer) return;

  const methods = await prisma.savedPaymentMethod.findMany({
    where: { customerId: customer.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  const seen = new Set<string>();
  const toDelete: typeof methods = [];
  for (const m of methods) {
    const key = `${m.brand}_${m.last4}_${m.expMonth}_${m.expYear}`;
    if (seen.has(key)) {
      toDelete.push(m);
    } else {
      seen.add(key);
    }
  }

  for (const m of toDelete) {
    try {
      await getStripe().paymentMethods.detach(m.stripePaymentMethodId);
    } catch {
      // Stripe側の解除に失敗してもDB側の整理は継続する
    }
    await prisma.savedPaymentMethod.delete({ where: { id: m.id } });
  }
}
