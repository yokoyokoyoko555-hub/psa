export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { ensureTradingCardCustomPrices } from "@/actions/pricing";
import { pricingSettingId } from "@/lib/pricing-setting-id";
import ShippingInsuranceForm from "./ShippingInsuranceForm";
import HandlingFeeForm from "./HandlingFeeForm";
import CampaignForm from "./CampaignForm";
import CustomServicePriceForm from "./CustomServicePriceForm";
import ExchangeRateForm from "./ExchangeRateForm";

const groupCls = "bg-white rounded-xl border border-gray-200 p-6";
const subCls = "border border-gray-100 rounded-lg p-4";

const ITEM_TYPE_LABELS: Record<string, string> = {
  TRADING_CARD: "トレーディングカード",
  UNOPENED_PACK: "未開封パック",
  COMIC_MAGAZINE: "コミック・マガジン",
};

export default async function SettingsPage() {
  await ensureTradingCardCustomPrices(); // 旧ServicePrice→CustomServicePrice(category=TRADING_CARD)の初回移行。ADR-0026

  const [siRates, settings, campaigns, customServicePrices, exchangeRate] = await Promise.all([
    prisma.shippingInsuranceRate.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.pricingSetting.findMany(),
    prisma.campaign.findMany({ orderBy: { startAt: "desc" } }),
    prisma.customServicePrice.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.exchangeRate.findUnique({ where: { id: "default" } }),
  ]);

  // region/itemTypeカラムでの照合は既存行のカラム不整合により一致しないことがあるため、idで照合する。
  // lib/pricing-setting-id.ts参照（ADR-0023追記の教訓）。
  const settingFor = (region: "PSA_JP" | "PSA_US", itemType: "TRADING_CARD" | "UNOPENED_PACK" | "COMIC_MAGAZINE") =>
    settings.find((s) => s.id === pricingSettingId(region, itemType));

  // PSA日本はトレーディングカードのみ（アイテム種別のネストなし＝従来通り）。PSA USのみ複数アイテム種別。
  const regions = [
    { region: "PSA_JP" as const, title: "PSA 日本（円）", itemTypes: ["TRADING_CARD"] as const },
    {
      region: "PSA_US" as const,
      title: "PSA US（USD）",
      itemTypes: ["TRADING_CARD", "UNOPENED_PACK", "COMIC_MAGAZINE"] as const,
    },
  ];

  return (
    <div className="p-8 max-w-6xl space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">料金設定</h1>

      {/* 為替レート（PSA US決済のJPY一本化用） */}
      <details className={groupCls} open>
        <summary className="text-lg font-bold text-gray-900 cursor-pointer select-none">
          為替レート — PSA US決済用
        </summary>
        <div className="mt-4">
          <ExchangeRateForm
            usdJpyRate={exchangeRate?.usdJpyRate ?? 150}
            marginPercent={exchangeRate?.marginPercent ?? 0}
          />
        </div>
      </details>

      {regions.map(({ region, title, itemTypes }) => (
        <details key={region} className={groupCls}>
          <summary className="text-lg font-bold text-gray-900 cursor-pointer select-none">{title}</summary>
          <div className="mt-4 space-y-4">
            {itemTypes.map((itemType) => {
              const ps = settingFor(region, itemType);
              const body = (
                <div className="space-y-4">
                  <div className={subCls}>
                    <h3 className="font-bold text-gray-800 mb-3">サービス料金（鑑定料・原価・申告上限）</h3>
                    <CustomServicePriceForm items={customServicePrices} category={itemType} region={region} />
                  </div>
                  <div className={subCls}>
                    <h3 className="font-bold text-gray-800 mb-3">代理入力料金・事務手数料（一律）</h3>
                    <HandlingFeeForm
                      region={region}
                      itemType={itemType}
                      unit="円"
                      proxyFee={ps?.proxyFee ?? 0}
                      handlingFee={ps?.handlingFee ?? 0}
                      freeShipInsQty={ps?.freeShipInsQty ?? 0}
                    />
                  </div>
                  <div className={subCls}>
                    <h3 className="font-bold text-gray-800 mb-3">送料・保険料</h3>
                    <ShippingInsuranceForm rates={siRates} region={region} itemType={itemType} unit="円" />
                  </div>
                </div>
              );
              // PSA_JPはアイテム種別が1つのみ＝ネストなしで従来通り表示
              return itemTypes.length === 1 ? (
                <div key={itemType}>{body}</div>
              ) : (
                <details key={itemType} className="border border-gray-200 rounded-lg p-4">
                  <summary className="font-bold text-gray-800 cursor-pointer select-none">
                    {ITEM_TYPE_LABELS[itemType]}
                  </summary>
                  <div className="mt-4">{body}</div>
                </details>
              );
            })}
          </div>
        </details>
      ))}

      {/* オートグラフ（デュアルサービス）料金 — PSA US トレーディングカード専用 */}
      <details className={groupCls}>
        <summary className="text-lg font-bold text-gray-900 cursor-pointer select-none">
          オートグラフ（デュアルサービス）料金 — PSA US
        </summary>
        <div className="mt-4">
          <CustomServicePriceForm items={customServicePrices} category="AUTOGRAPH" region="PSA_US" />
        </div>
      </details>

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
