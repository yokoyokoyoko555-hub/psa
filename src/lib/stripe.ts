import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-02-24.acacia",
  typescript: true,
});

export async function createCustomer(params: {
  email: string;
  name: string;
  phone?: string;
}) {
  return stripe.customers.create({
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
  return stripe.paymentIntents.create({
    amount: params.amount,
    currency: "jpy",
    customer: params.customerId,
    setup_future_usage: "off_session",
    description: params.description,
    metadata: {
      applicationId: params.applicationId,
    },
    automatic_payment_methods: { enabled: true },
  });
}

export async function chargeOffSession(params: {
  amount: number;
  customerId: string;
  paymentMethodId: string;
  description: string;
  upchargeId: string;
}) {
  return stripe.paymentIntents.create({
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
  return stripe.webhooks.constructEvent(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET!
  );
}
