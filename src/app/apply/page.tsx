export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCustomerSession } from "@/lib/customer-auth";
import { getCustomerProfile } from "@/actions/customer";
import { getMyAddresses } from "@/actions/address";
import { getDraft } from "@/actions/application";
import { ensureTradingCardCustomPrices } from "@/actions/pricing";
import { getLegalDocument } from "@/actions/legal-document";
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

  await ensureTradingCardCustomPrices(); // 旧ServicePrice→CustomServicePrice(category=TRADING_CARD)の初回移行。ADR-0026

  const [shippingRules, insuranceRules, customServicePrices, pricingSettings, profile, addresses, termsDocument] =
    await Promise.all([
      prisma.shippingRule.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
      prisma.insuranceRule.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
      prisma.customServicePrice.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
      prisma.pricingSetting.findMany(),
      getCustomerProfile(),
      getMyAddresses(),
      getLegalDocument("terms"), // 自己入力・代理入力どちらも同じ制定済みの利用規約を表示・同意対象にする。ADR-0077
    ]);

  return (
    <ApplyEntry
      customerId={customer.id}
      stripePublishableKey={process.env.STRIPE_PUBLISHABLE_KEY!}
      shippingRules={shippingRules}
      insuranceRules={insuranceRules}
      customServicePrices={customServicePrices}
      pricingSettings={pricingSettings}
      profile={profile}
      addresses={addresses}
      initialDraft={initialDraft}
      termsDocument={termsDocument}
    />
  );
}
