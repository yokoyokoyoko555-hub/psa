export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import ServicePriceForm from "./ServicePriceForm";
import ShippingInsuranceForm from "./ShippingInsuranceForm";
import HandlingFeeForm from "./HandlingFeeForm";
import CampaignForm from "./CampaignForm";

const groupCls = "bg-white rounded-xl border border-gray-200 p-6";
const subCls = "border border-gray-100 rounded-lg p-4";

export default async function SettingsPage() {
  const [servicePrices, siRates, settings, campaigns] = await Promise.all([
    prisma.servicePrice.findMany({ orderBy: { pricePerCard: "asc" } }),
    prisma.shippingInsuranceRate.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.pricingSetting.findMany(),
    prisma.campaign.findMany({ orderBy: { startAt: "desc" } }),
  ]);

  const settingFor = (region: string) => settings.find((s) => s.id === region);

  const regions = [
    { region: "PSA_JP" as const, title: "PSA 日本（円）", unit: "円" },
    { region: "PSA_US" as const, title: "PSA US（USD）", unit: "$" },
  ];

  return (
    <div className="p-8 max-w-6xl space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">料金設定</h1>

      {regions.map(({ region, title, unit }) => {
        const ps = settingFor(region);
        return (
          <details key={region} className={groupCls}>
            <summary className="text-lg font-bold text-gray-900 cursor-pointer select-none">{title}</summary>
            <div className="mt-4 space-y-4">
              <div className={subCls}>
                <h3 className="font-bold text-gray-800 mb-3">サービス料金（鑑定料・原価・申告上限）</h3>
                <ServicePriceForm servicePrices={servicePrices} region={region} unit={unit} />
              </div>
              <div className={subCls}>
                <h3 className="font-bold text-gray-800 mb-3">代理入力料金・事務手数料（一律）</h3>
                <HandlingFeeForm region={region} unit={unit} proxyFee={ps?.proxyFee ?? 0} handlingFee={ps?.handlingFee ?? 0} freeShipInsQty={ps?.freeShipInsQty ?? 0} />
              </div>
              <div className={subCls}>
                <h3 className="font-bold text-gray-800 mb-3">送料・保険料</h3>
                <ShippingInsuranceForm rates={siRates} region={region} unit={unit} />
              </div>
            </div>
          </details>
        );
      })}

      {/* キャンペーン割引（全リージョン共通の管理） */}
      <details className={groupCls}>
        <summary className="text-lg font-bold text-gray-900 cursor-pointer select-none">キャンペーン割引（新規獲得）</summary>
        <div className="mt-4">
          <CampaignForm campaigns={campaigns} />
        </div>
      </details>
    </div>
  );
}
