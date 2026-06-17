export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCustomerSession } from "@/lib/customer-auth";
import ApplyForm from "./ApplyForm";
import { prisma } from "@/lib/prisma";

export default async function ApplyPage() {
  const customer = await getCustomerSession();
  if (!customer) redirect("/login");

  const [servicePrices, shippingRules, insuranceRules] = await Promise.all([
    prisma.servicePrice.findMany({ where: { isActive: true } }),
    prisma.shippingRule.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.insuranceRule.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <ApplyForm
      customerId={customer.id}
      stripePublishableKey={process.env.STRIPE_PUBLISHABLE_KEY!}
      servicePrices={servicePrices}
      shippingRules={shippingRules}
      insuranceRules={insuranceRules}
    />
  );
}
