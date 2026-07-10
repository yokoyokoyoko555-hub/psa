export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import CustomerHeader from "@/components/CustomerHeader";
import Footer from "@/components/Footer";
import { formatMoney, formatMoneyInt, formatMoneyIn } from "@/lib/currency";
import { pricingSettingId } from "@/lib/pricing-setting-id";
import type { ServiceRegion, ItemType } from "@prisma/client";

export const metadata = { title: "料金表 | トレカビンクス" };

const ITEM_TYPE_LABELS: Record<string, string> = {
  TRADING_CARD: "トレーディングカード",
  UNOPENED_PACK: "未開封パック",
  COMIC_MAGAZINE: "コミック・マガジン",
  AUTOGRAPH: "デュアルサービス（カード＋サイン鑑定）",
};

// PSA日本は常にトレーディングカードのみ。PSA USはアイテム種別＋デュアルサービス（オートグラフ）。ADR-0023/0029/0043
const REGIONS = [
  { region: "PSA_JP" as ServiceRegion, title: "PSA 日本（円）", itemTypes: ["TRADING_CARD"] as ItemType[] },
  {
    region: "PSA_US" as ServiceRegion,
    title: "PSA US（ドル）",
    itemTypes: ["TRADING_CARD", "AUTOGRAPH", "UNOPENED_PACK", "COMIC_MAGAZINE"] as ItemType[],
  },
];

function valueBand(min: number, max: number | null, region: ServiceRegion): string {
  return `${formatMoneyInt(min, region)} 〜 ${max === null ? "上限なし" : formatMoneyInt(max, region)}`;
}

function qtyBand(min: number, max: number | null): string {
  return max === null ? `${min}枚〜` : `${min}〜${max}枚`;
}

export default async function PricingPage() {
  const [customServicePrices, pricingSettings, matrixRates, shippingRules, insuranceRules] = await Promise.all([
    prisma.customServicePrice.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.pricingSetting.findMany(),
    prisma.shippingInsuranceRate.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.shippingRule.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.insuranceRule.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  const settingFor = (region: ServiceRegion, itemType: ItemType) =>
    pricingSettings.find((s) => s.id === pricingSettingId(region, itemType));

  return (
    <div className="min-h-screen bg-gray-50">
      <CustomerHeader title="料金表" />

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h1 className="text-xl font-bold text-gray-900 mb-2">PSA鑑定代行サービス 料金表</h1>
          <p className="text-sm text-gray-600">
            下記の鑑定料に加えて、送料・保険料、事務手数料（全申込）、代理入力をご依頼の場合は代理入力料金がかかります。表示価格は税抜、消費税10%が別途かかります。
          </p>
        </div>

        {REGIONS.map(({ region, title, itemTypes }) => (
          <section key={region} className="space-y-4">
            <h2 className="text-lg font-bold text-gray-900 border-b border-gray-200 pb-2">{title}</h2>

            {itemTypes.map((itemType) => {
              const tiers = customServicePrices
                .filter((p) => p.region === region && p.category === itemType)
                .sort((a, b) => a.sortOrder - b.sortOrder);
              if (tiers.length === 0) return null;

              const setting = settingFor(region, itemType);
              const matrix = matrixRates
                .filter((r) => r.region === region && r.itemType === itemType)
                .sort((a, b) => a.sortOrder - b.sortOrder);
              const legacyShipping = shippingRules
                .filter((r) => r.itemType === itemType)
                .sort((a, b) => a.sortOrder - b.sortOrder);
              const legacyInsurance = insuranceRules
                .filter((r) => r.itemType === itemType)
                .sort((a, b) => a.sortOrder - b.sortOrder);

              return (
                <div key={itemType} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
                  {itemTypes.length > 1 && (
                    <h3 className="font-bold text-gray-800">{ITEM_TYPE_LABELS[itemType] ?? itemType}</h3>
                  )}
                  {itemType === "AUTOGRAPH" && (
                    <p className="text-xs text-gray-500">
                      デュアルサービスは、カードとサイン（オートグラフ）の両方を鑑定するサービスです。通常サービスの代わりにお選びいただけます。
                    </p>
                  )}

                  {/* サービスレベル別鑑定料 */}
                  <div>
                    <p className="text-sm font-bold text-gray-700 mb-2">鑑定料金</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="text-left px-3 py-2 text-gray-600 font-medium">サービスレベル</th>
                            <th className="text-right px-3 py-2 text-gray-600 font-medium">鑑定料（1枚）</th>
                            <th className="text-right px-3 py-2 text-gray-600 font-medium">申告価格上限</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {tiers.map((tier) => (
                            <tr key={tier.id}>
                              <td className="px-3 py-2 text-gray-900">{tier.name}</td>
                              <td className="px-3 py-2 text-right font-medium text-gray-900">
                                {formatMoney(tier.pricePerCard, region)}
                              </td>
                              <td className="px-3 py-2 text-right text-gray-600">
                                {tier.maxDeclaredValue === null ? "なし" : formatMoneyInt(tier.maxDeclaredValue, region)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 代理入力料金・事務手数料 */}
                  <div className="grid grid-cols-2 gap-4 text-sm border-t border-gray-100 pt-4">
                    <div>
                      <p className="text-gray-500">代理入力料金（1枚あたり・代理入力時のみ）</p>
                      <p className="font-bold text-gray-900">{formatMoneyIn(setting?.proxyFee ?? 0, "JPY")}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">事務手数料（1申込あたり）</p>
                      <p className="font-bold text-gray-900">{formatMoneyIn(setting?.handlingFee ?? 0, "JPY")}</p>
                    </div>
                  </div>

                  {/* 送料・保険料 */}
                  <div className="border-t border-gray-100 pt-4">
                    <p className="text-sm font-bold text-gray-700 mb-2">送料・保険料</p>
                    {matrix.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                              <th className="text-left px-3 py-2 text-gray-600 font-medium">申告価格合計</th>
                              <th className="text-left px-3 py-2 text-gray-600 font-medium">枚数</th>
                              <th className="text-right px-3 py-2 text-gray-600 font-medium">送料・保険料</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {matrix.map((r) => (
                              <tr key={r.id}>
                                <td className="px-3 py-2 text-gray-900">{valueBand(r.minValue, r.maxValue, region)}</td>
                                <td className="px-3 py-2 text-gray-900">{qtyBand(r.qtyMin, r.qtyMax)}</td>
                                <td className="px-3 py-2 text-right font-medium text-gray-900">
                                  {formatMoneyIn(r.fee, "JPY")}
                                  {r.perCardSurcharge > 0 && (
                                    <span className="text-xs text-gray-500">
                                      {" "}
                                      + {formatMoneyIn(r.perCardSurcharge, "JPY")}/枚（26枚目以降）
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {legacyShipping.length > 0 && (
                          <div className="overflow-x-auto">
                            <p className="text-xs text-gray-500 mb-1">送料（返却方法・申込金額帯別）</p>
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                  <th className="text-left px-3 py-2 text-gray-600 font-medium">返却方法</th>
                                  <th className="text-left px-3 py-2 text-gray-600 font-medium">申込金額</th>
                                  <th className="text-right px-3 py-2 text-gray-600 font-medium">送料</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {legacyShipping.map((r) => (
                                  <tr key={r.id}>
                                    <td className="px-3 py-2 text-gray-900">
                                      {r.returnMethod === "STORE_PICKUP" ? "店頭受取" : "配送"}
                                    </td>
                                    <td className="px-3 py-2 text-gray-900">{valueBand(r.minAmount, r.maxAmount, region)}</td>
                                    <td className="px-3 py-2 text-right font-medium text-gray-900">
                                      {formatMoneyIn(r.fee, "JPY")}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {legacyInsurance.length > 0 && (
                          <div className="overflow-x-auto">
                            <p className="text-xs text-gray-500 mb-1">保険料（申告額帯別）</p>
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                  <th className="text-left px-3 py-2 text-gray-600 font-medium">申告額</th>
                                  <th className="text-right px-3 py-2 text-gray-600 font-medium">保険料</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {legacyInsurance.map((r) => (
                                  <tr key={r.id}>
                                    <td className="px-3 py-2 text-gray-900">{valueBand(r.minValue, r.maxValue, region)}</td>
                                    <td className="px-3 py-2 text-right font-medium text-gray-900">
                                      {r.feeRate ? `${r.feeRate}%` : formatMoneyIn(r.fee, "JPY")}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {legacyShipping.length === 0 && legacyInsurance.length === 0 && (
                          <p className="text-sm text-gray-400">現在準備中です。</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </main>

      <Footer />
    </div>
  );
}
