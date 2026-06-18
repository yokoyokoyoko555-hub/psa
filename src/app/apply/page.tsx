export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCustomerSession } from "@/lib/customer-auth";
import { getCustomerProfile } from "@/actions/customer";
import { getMyAddresses } from "@/actions/address";
import ApplyEntry from "./ApplyEntry";
import { prisma } from "@/lib/prisma";

export default async function ApplyPage() {
  const customer = await getCustomerSession();
  if (!customer) redirect("/login");

  const [servicePrices, shippingRules, insuranceRules, profile, addresses] = await Promise.all([
    prisma.servicePrice.findMany({ where: { isActive: true }, orderBy: { pricePerCard: "asc" } }),
    prisma.shippingRule.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.insuranceRule.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
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
      profile={profile}
      addresses={addresses}
    />
  );
}
