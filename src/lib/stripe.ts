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
  /** 指定するとStripeが決済完了時に自動でレシートメールを送る（このシステム側では領収書を発行していないため）。 */
  receiptEmail?: string;
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
    ...(params.receiptEmail ? { receipt_email: params.receiptEmail } : {}),
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
  /** 指定するとStripeが決済完了時に自動でレシートメールを送る（このシステム側では領収書を発行していないため）。 */
  receiptEmail?: string;
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
    ...(params.receiptEmail ? { receipt_email: params.receiptEmail } : {}),
  });
}

/**
 * 決済（PaymentIntent）が既に完了した申込について、インボイス制度対応の適格請求書PDFを
 * 生成するためだけにStripe Invoiceを作成する。実際の課金はしない（paid_out_of_bandで支払済み扱いにする）。
 * PDFはinvoice_pdfのURLから取得し、こちらのメール（Resend）で送付する運用。
 */
export async function createPaidInvoice(params: {
  customerId: string;
  applicationId: string;
  description: string;
  /** 明細行。合計がapplication.totalAmountと一致するように呼び出し側で調整すること。 */
  lineItems: { description: string; amount: number }[];
}) {
  const stripe = getStripe();

  // 先にdraft請求書を作成し、明細を"顧客の未請求プール"ではなくこのinvoice IDに直接紐付ける。
  // pending_invoice_items_behaviorで顧客のプールごと拾う方式だと、過去に別の申込で作られた
  // 未消化の明細まで一緒に取り込まれてしまうため（実際に発生した不具合）。
  const invoice = await stripe.invoices.create({
    customer: params.customerId,
    collection_method: "send_invoice",
    days_until_due: 0,
    auto_advance: false,
    description: params.description,
    metadata: { applicationId: params.applicationId },
  });

  for (const item of params.lineItems) {
    await stripe.invoiceItems.create({
      customer: params.customerId,
      invoice: invoice.id,
      currency: "jpy",
      amount: Math.round(item.amount),
      description: item.description,
    });
  }

  const finalized = await stripe.invoices.finalizeInvoice(invoice.id!, { auto_advance: false });
  // 合計金額が0円の請求書はfinalize時点でStripe側が自動的にstatus="paid"にするため、
  // その場合にpay()を呼ぶと「Invoice is already paid」エラーになる。既にpaidならそのまま返す。
  if (finalized.status === "paid") {
    return finalized;
  }
  return stripe.invoices.pay(invoice.id!, { paid_out_of_band: true });
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
