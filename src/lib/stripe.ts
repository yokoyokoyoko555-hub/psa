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
  customerId: string;
  applicationId: string;
  description: string;
}) {
  return getStripe().paymentIntents.create({
    amount: params.amount,
    currency: "jpy",
    customer: params.customerId,
    setup_future_usage: "off_session",
    description: params.description,
    metadata: {
      applicationId: params.applicationId,
    },
    payment_method_types: ["card"],
  });
}

export async function chargeOffSession(params: {
  amount: number;
  customerId: string;
  paymentMethodId: string;
  description: string;
  upchargeId: string;
}) {
  return getStripe().paymentIntents.create({
    amount: params.amount,
    currency: "jpy",
    customer: params.customerId,
    payment_method: params.paymentMethodId,
    off_session: true,
    confirm: true,
    description: params.description,
    metadata: {
      upchargeId: params.upchargeId,
    },
  });
}

export function constructWebhookEvent(payload: string | Buffer, signature: string) {
  return getStripe().webhooks.constructEvent(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET!
  );
}
