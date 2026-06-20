export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import ServicePriceForm from "./ServicePriceForm";
import ShippingRuleForm from "./ShippingRuleForm";
import InsuranceRuleForm from "./InsuranceRuleForm";

export default async function SettingsPage() {
  const [servicePrices, shippingRules, insuranceRules] = await Promise.all([
    prisma.servicePrice.findMany({ orderBy: { pricePerCard: "asc" } }),
    prisma.shippingRule.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.insuranceRule.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <div className="p-8 max-w-6xl space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">設定</h1>

      {/* Service Prices */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-bold text-gray-900 mb-4">サービス料金設定</h2>
        <ServicePriceForm servicePrices={servicePrices} />
      </div>

      {/* Shipping Rules */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-bold text-gray-900 mb-4">送料設定</h2>
        <ShippingRuleForm shippingRules={shippingRules} />
      </div>

      {/* Insurance Rules */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-bold text-gray-900 mb-4">保険料設定</h2>
        <InsuranceRuleForm insuranceRules={insuranceRules} />
      </div>
    </div>
  );
}
