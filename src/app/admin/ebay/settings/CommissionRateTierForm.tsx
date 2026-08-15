"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CommissionRateTier, SalesPlatform } from "@prisma/client";
import { saveCommissionRateTiers } from "@/actions/ebay-settings";

type Tier = {
  minUsd: string; // ドル表記（DBはセント=Minor単位）
  maxUsd: string; // 空欄=上限なし
  commissionRate: string; // %
};

const inputCls = "w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500";

function toTiers(rates: CommissionRateTier[]): Tier[] {
  return [...rates]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((r) => ({
      minUsd: (r.minSaleAmountUsdMinor / 100).toString(),
      maxUsd: r.maxSaleAmountUsdMinor === null ? "" : (r.maxSaleAmountUsdMinor / 100).toString(),
      commissionRate: r.commissionRate.toString(),
    }));
}

/** 成約価格帯ごとの手数料率テーブル編集フォーム（ADMINのみ保存可）。ADR-0078/0079/0080 */
export default function CommissionRateTierForm({
  platform,
  tiers: initialTiers,
}: {
  platform: SalesPlatform;
  tiers: CommissionRateTier[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [tiers, setTiers] = useState<Tier[]>(() => {
    const t = toTiers(initialTiers);
    return t.length > 0 ? t : [{ minUsd: "0", maxUsd: "", commissionRate: "20" }];
  });

  function update(i: number, patch: Partial<Tier>) {
    setTiers((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }
  function addTier() {
    setTiers((prev) => [...prev, { minUsd: "", maxUsd: "", commissionRate: "20" }]);
  }
  function removeTier(i: number) {
    setTiers((prev) => prev.filter((_, idx) => idx !== i));
  }

  function save() {
    setMessage("");
    startTransition(async () => {
      const payload = {
        platform,
        tiers: tiers.map((t) => ({
          minSaleAmountUsdMinor: Math.round((parseFloat(t.minUsd) || 0) * 100),
          maxSaleAmountUsdMinor: t.maxUsd === "" ? null : Math.round(parseFloat(t.maxUsd) * 100),
          commissionRate: parseFloat(t.commissionRate) || 0,
        })),
      };
      const res = await saveCommissionRateTiers(payload);
      setMessage(res.success ? "保存しました" : res.error ?? "保存に失敗しました");
      if (res.success) router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        eBay成約価格帯（USD）ごとに、精算時に差し引く手数料率（%）を設定します。上限を空欄にすると「上限なし」になります。
      </p>
      <div className="space-y-3">
        {tiers.map((t, i) => (
          <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-600">価格帯 {i + 1}</span>
              {tiers.length > 1 && (
                <button type="button" onClick={() => removeTier(i)} className="text-xs text-gray-400 hover:text-red-600">
                  削除
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">成約額 下限（USD）</label>
                <input type="number" min={0} step="0.01" value={t.minUsd} onChange={(e) => update(i, { minUsd: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">成約額 上限（USD）</label>
                <input type="number" min={0} step="0.01" placeholder="上限なし" value={t.maxUsd} onChange={(e) => update(i, { maxUsd: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">手数料率（%）</label>
                <input type="number" min={0} max={100} step="0.1" value={t.commissionRate} onChange={(e) => update(i, { commissionRate: e.target.value })} className={inputCls} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={addTier} className="border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
          ＋ 価格帯を追加
        </button>
        <div className="ml-auto flex items-center gap-3">
          {message && <span className="text-green-700 text-sm">{message}</span>}
          <button type="button" onClick={save} disabled={isPending} className="bg-brand-600 text-white font-bold px-6 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50 text-sm">
            {isPending ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
