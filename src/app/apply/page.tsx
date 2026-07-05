export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCustomerSession } from "@/lib/customer-auth";
import { getCustomerProfile } from "@/actions/customer";
import { getMyAddresses } from "@/actions/address";
import { getDraft } from "@/actions/application";
import ApplyEntry from "./ApplyEntry";
import { prisma } from "@/lib/prisma";

export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  const customer = await getCustomerSession();
  if (!customer) redirect("/login");

  const { draft: draftId } = await searchParams;
  const initialDraft = draftId ? await getDraft(draftId) : null;

  const [servicePrices, shippingRules, insuranceRules, customServicePrices, profile, addresses] = await Promise.all([
    prisma.servicePrice.findMany({ where: { isActive: true }, orderBy: { pricePerCard: "asc" } }),
    prisma.shippingRule.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.insuranceRule.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.customServicePrice.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    getCustomerProfile(),
    getMyAddresses(),
  ]);

  return (
    <ApplyEntry
      customerId={customer.id}
      stripePublishableKey={process.env.STRIPE_PUBLISHABLE_KEY!}
      servicePrices={servicePrices}
      shippingRules={shippingRules}
      insuranceRules={insuranceRules}
      customServicePrices={customServicePrices}
      profile={profile}
      addresses={addresses}
      initialDraft={initialDraft}
    />
  );
}
