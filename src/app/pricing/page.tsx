export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import CustomerHeader from "@/components/CustomerHeader";
import Footer from "@/components/Footer";
import { formatMoney, formatMoneyInt, formatMoneyIn } from "@/lib/currency";
import { pricingSettingId } from "@/lib/pricing-setting-id";
import type { ServiceRegion, ItemType, ShippingInsuranceRate } from "@prisma/client";

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

// 1テーブルあたりの申告価格帯（列）数。多すぎると横に長くなるため分割する。
const VALUE_BAND_CHUNK_SIZE = 5;

function valueBand(min: number, max: number | null, region: ServiceRegion): string {
  return `${formatMoneyInt(min, region)} 〜 ${max === null ? "上限なし" : formatMoneyInt(max, region)}`;
}

function shortValueBand(max: number | null, region: ServiceRegion): string {
  return max === null ? "上限なし" : `〜${formatMoneyInt(max, region)}`;
}

function qtyBand(min: number, max: number | null): string {
  return max === null ? `${min}枚以上` : `${min}-${max}枚`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

/** 送料・保険料マトリクスを「申告価格帯×枚数帯」のピボット表として描画する。添付イメージに合わせた形式。 */
function ShippingInsuranceMatrix({ rows, region }: { rows: ShippingInsuranceRate[]; region: ServiceRegion }) {
  const valueBands = [...new Map(rows.map((r) => [`${r.minValue}-${r.maxValue}`, { min: r.minValue, max: r.maxValue }])).values()].sort(
    (a, b) => a.min - b.min
  );
  const qtyBands = [...new Map(rows.map((r) => [`${r.qtyMin}-${r.qtyMax}`, { min: r.qtyMin, max: r.qtyMax }])).values()].sort(
    (a, b) => a.min - b.min
  );
  const normalQtyBands = qtyBands.filter((q) => q.max !== null);
  const openQtyBand = qtyBands.find((q) => q.max === null) ?? null;

  const findRate = (valMin: number, valMax: number | null, qtyMin: number, qtyMax: number | null) =>
    rows.find((r) => r.minValue === valMin && r.maxValue === valMax && r.qtyMin === qtyMin && r.qtyMax === qtyMax);

  return (
    <div className="space-y-4">
      {chunk(valueBands, VALUE_BAND_CHUNK_SIZE).map((cols, chunkIdx) => (
        <div key={chunkIdx} className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="bg-gray-50" colSpan={2} />
                <th colSpan={cols.length} className="bg-red-600 text-white font-bold py-2 text-center">
                  申告価格の合計金額
                </th>
              </tr>
              <tr>
                <th className="bg-gray-50" colSpan={2} />
                {cols.map((v) => (
                  <th key={`${v.min}-${v.max}`} className="bg-gray-100 text-gray-800 font-bold px-3 py-2 text-center whitespace-nowrap">
                    {shortValueBand(v.max, region)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {normalQtyBands.map((q, i) => (
                <tr key={`${q.min}-${q.max}`} className="border-t border-gray-200">
                  {i === 0 && (
                    <td
                      rowSpan={normalQtyBands.length + (openQtyBand ? 1 : 0)}
                      className="bg-gray-900 text-white font-bold text-center align-middle px-2"
                    >
                      合計の
                      <br />
                      枚数
                    </td>
                  )}
                  <td className="bg-gray-100 text-gray-800 font-bold px-3 py-2 whitespace-nowrap">{qtyBand(q.min, q.max)}</td>
                  {cols.map((v) => {
                    const rate = findRate(v.min, v.max, q.min, q.max);
                    return (
                      <td key={`${v.min}-${v.max}`} className="px-3 py-2 text-center font-bold text-gray-900 border-l border-gray-100">
                        {rate ? formatMoneyIn(rate.fee, "JPY") : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}

              {openQtyBand &&
                (() => {
                  // 26枚以上の行は基準額が直上の帯と同額のため、加算単価（円/枚）のみをまとめて表示する。
                  const surcharges = cols.map((v) => findRate(v.min, v.max, openQtyBand.min, openQtyBand.max)?.perCardSurcharge ?? 0);
                  const groups: { surcharge: number; span: number }[] = [];
                  for (const s of surcharges) {
                    const last = groups[groups.length - 1];
                    if (last && last.surcharge === s) last.span += 1;
                    else groups.push({ surcharge: s, span: 1 });
                  }
                  return (
                    <tr className="border-t border-gray-200">
                      <td className="bg-gray-100 text-gray-800 font-bold px-3 py-2 whitespace-nowrap">
                        {qtyBand(openQtyBand.min, openQtyBand.max)}
                      </td>
                      {groups.map((g, i) => (
                        <td
                          key={i}
                          colSpan={g.span}
                          className="px-3 py-2 text-center font-bold text-gray-900 border-l border-gray-100"
                        >
                          {g.surcharge > 0 ? `${g.surcharge.toLocaleString()}円/枚 加算` : "加算なし"}
                        </td>
                      ))}
                    </tr>
                  );
                })()}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
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
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <CustomerHeader
        title="料金表"
        actions={
          <Link
            href="/apply"
            className="shrink-0 bg-brand-600 text-white rounded-full px-4 py-1.5 text-sm font-bold hover:bg-brand-700 transition"
          >
            新規申込
          </Link>
        }
      />

      <main className="flex-1 max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h1 className="text-xl font-bold text-gray-900 mb-2">PSA鑑定代行サービス 料金表</h1>
          <p className="text-sm text-gray-600">
            下記の鑑定料に加えて、送料・保険料、事務手数料（全申込）、代理入力をご依頼の場合は代理入力料金がかかります。表示価格はすべて消費税込みです。申込の流れは
            <Link href="/how-to-apply" className="text-brand-600 hover:underline">
              こちら
            </Link>
            からご確認ください。
          </p>
        </div>

        {REGIONS.map(({ region, title, itemTypes }) => (
          <details key={region} className="bg-white rounded-xl border border-gray-200 p-6">
            <summary className="text-lg font-bold text-gray-900 cursor-pointer select-none">{title}</summary>

            <div className="mt-4 space-y-4">
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

                const body = (
                  <div className="space-y-5">
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm border-t border-gray-100 pt-4">
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
                        <ShippingInsuranceMatrix rows={matrix} region={region} />
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

                // PSA_JPはアイテム種別が1つのみ＝ネストなしで表示。PSA_USはアイテム種別ごとに蛇腹。
                return itemTypes.length === 1 ? (
                  <div key={itemType}>{body}</div>
                ) : (
                  <details key={itemType} className="border border-gray-200 rounded-lg p-4">
                    <summary className="font-bold text-gray-800 cursor-pointer select-none">
                      {ITEM_TYPE_LABELS[itemType] ?? itemType}
                    </summary>
                    <div className="mt-4">{body}</div>
                  </details>
                );
              })}
            </div>
          </details>
        ))}
      </main>

      <Footer />
    </div>
  );
}
