import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-02-24.acacia",
      typescript: true,
    });
  }
  return _stripe;
}

export async function createCustomer(params: {
  email: string;
  name: string;
  phone?: string;
}) {
  return getStripe().customers.create({
    email: params.email,
    name: params.name,
    phone: params.phone,
  });
}

export async function createPaymentIntent(params: {
  amount: number;
  currency: string;
  customerId: string;
  applicationId: string;
  description: string;
  /** 保存済みカードを事前アタッチする場合に指定。クライアントはconfirmCardPayment(clientSecret)のみでよくなる
   * （カード再入力不要）。顧客が能動的にボタンを押して確定するオンセッション決済のため、off_session化はしない。ADR-0048 */
  paymentMethodId?: string;
}) {
  return getStripe().paymentIntents.create({
    amount: params.amount,
    currency: params.currency,
    customer: params.customerId,
    setup_future_usage: "off_session",
    description: params.description,
    metadata: {
      applicationId: params.applicationId,
    },
    ...(params.paymentMethodId ? { payment_method: params.paymentMethodId } : {}),
    payment_method_types: ["card"],
  });
}

/** 保存済みカードへの即時off-session課金。Upcharge・代理申込の確定分請求など、後日の追加請求全般で使う。ADR-0038 */
export async function chargeOffSession(params: {
  amount: number;
  currency: string;
  customerId: string;
  paymentMethodId: string;
  description: string;
  /** Stripeメタデータに残す参照ID（Upcharge.id、Application.idなど呼び出し元の対象を識別する値） */
  referenceId: string;
}) {
  return getStripe().paymentIntents.create({
    amount: params.amount,
    currency: params.currency,
    customer: params.customerId,
    payment_method: params.paymentMethodId,
    off_session: true,
    confirm: true,
    description: params.description,
    metadata: {
      referenceId: params.referenceId,
    },
  });
}

export async function createCheckoutSubscriptionSession(params: {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}) {
  return getStripe().checkout.sessions.create({
    mode: "subscription",
    customer: params.customerId,
    line_items: [{ price: params.priceId, quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    allow_promotion_codes: true,
  });
}

export async function createBillingPortalSession(params: {
  customerId: string;
  returnUrl: string;
}) {
  return getStripe().billingPortal.sessions.create({
    customer: params.customerId,
    return_url: params.returnUrl,
  });
}

export function constructWebhookEvent(payload: string | Buffer, signature: string) {
  return getStripe().webhooks.constructEvent(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET!
  );
}
