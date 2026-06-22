"use server";

import { getCustomerSession } from "@/lib/customer-auth";
import { createCheckoutSubscriptionSession, createBillingPortalSession } from "@/lib/stripe";
import { ensureStripeCustomer } from "@/lib/stripe-customer";
import { logOperation, getClientIp } from "@/lib/operation-log";
import { headers } from "next/headers";

function baseUrl(): string {
  return process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "";
}

/** センタリングAIプランの加入: Stripe Checkout(subscription) のURLを返す */
export async function startCenteringSubscription(): Promise<{ url?: string; error?: string }> {
  const customer = await getCustomerSession();
  if (!customer) return { error: "ログインが必要です" };

  const priceId = process.env.STRIPE_CENTERING_PRICE_ID;
  if (!priceId) return { error: "プランが未設定です。しばらくお待ちください。" };

  try {
    const stripeCustomerId = await ensureStripeCustomer(customer);
    const base = baseUrl();
    const session = await createCheckoutSubscriptionSession({
      customerId: stripeCustomerId,
      priceId,
      successUrl: `${base}/mypage/centering?subscribed=1`,
      cancelUrl: `${base}/mypage/centering`,
    });

    const hdrs = await headers();
    await logOperation({
      customerId: customer.id,
      ipAddress: getClientIp({ headers: hdrs } as unknown as Request),
      action: "CENTERING_SUBSCRIBE_START",
      targetType: "subscriptions",
      targetId: customer.id,
    });

    return { url: session.url ?? undefined };
  } catch (err) {
    console.error("startCenteringSubscription failed:", err);
    return { error: "決済ページの作成に失敗しました。" };
  }
}

/** Stripe Customer Portal（解約・支払い方法変更）のURLを返す */
export async function openBillingPortal(): Promise<{ url?: string; error?: string }> {
  const customer = await getCustomerSession();
  if (!customer) return { error: "ログインが必要です" };

  try {
    const stripeCustomerId = await ensureStripeCustomer(customer);
    const session = await createBillingPortalSession({
      customerId: stripeCustomerId,
      returnUrl: `${baseUrl()}/mypage/centering`,
    });
    return { url: session.url };
  } catch (err) {
    console.error("openBillingPortal failed:", err);
    return { error: "管理画面を開けませんでした。" };
  }
}
