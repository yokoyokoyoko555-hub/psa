export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import ServicePriceForm from "./ServicePriceForm";
import ShippingRuleForm from "./ShippingRuleForm";
import InsuranceRuleForm from "./InsuranceRuleForm";
import ShippingInsuranceForm from "./ShippingInsuranceForm";

export default async function SettingsPage() {
  const [servicePrices, shippingRules, insuranceRules, siRates] = await Promise.all([
    prisma.servicePrice.findMany({ orderBy: { pricePerCard: "asc" } }),
    prisma.shippingRule.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.insuranceRule.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.shippingInsuranceRate.findMany({ where: { region: "PSA_JP" }, orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <div className="p-8 max-w-6xl space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">設定</h1>

      {/* Service Prices */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-bold text-gray-900 mb-4">サービス料金設定</h2>
        <ServicePriceForm servicePrices={servicePrices} />
      </div>

      {/* 送料・保険 合算マトリクス（PSA日本） */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-bold text-gray-900 mb-1">送料・保険料設定（PSA日本）</h2>
        <p className="text-xs text-gray-500 mb-4">申告価格の合計金額帯 × 枚数で決まる送料・保険の合算金額です。</p>
        <ShippingInsuranceForm rates={siRates} />
      </div>

      {/* 旧設定（PSA US・レガシー） */}
      <details className="bg-white rounded-xl border border-gray-200 p-6">
        <summary className="font-bold text-gray-900 cursor-pointer">送料・保険（旧設定 / PSA US用）</summary>
        <p className="text-xs text-gray-500 mt-2 mb-4">
          PSA日本は上の合算マトリクスを使用します。こちらは PSA US（据え置き）向けの旧ルールです。
        </p>
        <div className="space-y-6">
          <div>
            <h3 className="font-bold text-gray-800 mb-3">送料設定（旧）</h3>
            <ShippingRuleForm shippingRules={shippingRules} />
          </div>
          <div>
            <h3 className="font-bold text-gray-800 mb-3">保険料設定（旧）</h3>
            <InsuranceRuleForm insuranceRules={insuranceRules} />
          </div>
        </div>
      </details>
    </div>
  );
}
