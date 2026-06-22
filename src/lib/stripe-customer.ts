import { prisma } from "./prisma";
import { getStripe, createCustomer as createStripeCustomer } from "./stripe";
import { decrypt } from "./crypto";

type CustomerRecord = {
  id: string;
  email: string;
  nameEncrypted: string;
  phoneEncrypted: string;
  stripeCustomerId: string | null;
};

function isMissingCustomerError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: string; message?: string };
  return e.code === "resource_missing" || (typeof e.message === "string" && e.message.includes("No such customer"));
}

/**
 * 顧客の Stripe Customer を保証する。保存済みIDが現在のStripe環境に存在しない／削除済みなら
 * 作り直してDBを更新する（サンドボックス↔本番の環境差や、seed由来の無効IDをリカバリ）。
 */
export async function ensureStripeCustomer(customer: CustomerRecord): Promise<string> {
  const stripe = getStripe();

  if (customer.stripeCustomerId) {
    try {
      const sc = await stripe.customers.retrieve(customer.stripeCustomerId);
      if (!("deleted" in sc && sc.deleted)) return customer.stripeCustomerId;
    } catch (err) {
      if (!isMissingCustomerError(err)) throw err;
    }
  }

  const created = await createStripeCustomer({
    email: customer.email,
    name: decrypt(customer.nameEncrypted),
    phone: decrypt(customer.phoneEncrypted),
  });
  await prisma.customer.update({
    where: { id: customer.id },
    data: { stripeCustomerId: created.id },
  });
  return created.id;
}
