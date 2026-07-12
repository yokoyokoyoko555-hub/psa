"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ShippingInsuranceRate } from "@prisma/client";
import { saveShippingInsuranceRates } from "@/actions/pricing";

type Band = {
  minValue: string;
  maxValue: string; // 空欄=上限なし
  fee8: string;
  fee25: string;
  surcharge: string;
};

const inputCls = "w-32 border border-gray-300 rounded px-2 py-1 text-sm text-gray-900";

// DB行（1帯=3行）から申告価格帯ごとにまとめ直す
function toBands(rates: ShippingInsuranceRate[]): Band[] {
  const map = new Map<string, Band & { _min: number }>();
  for (const r of rates) {
    const key = `${r.minValue}-${r.maxValue ?? "x"}`;
    const b = map.get(key) ?? {
      _min: r.minValue,
      minValue: String(r.minValue),
      maxValue: r.maxValue === null ? "" : String(r.maxValue),
      fee8: "",
      fee25: "",
      surcharge: "",
    };
    if (r.qtyMin === 1) b.fee8 = String(r.fee);
    else if (r.qtyMin === 9) b.fee25 = String(r.fee);
    else if (r.qtyMin === 26) b.surcharge = String(r.perCardSurcharge);
    map.set(key, b);
  }
  return Array.from(map.values())
    .sort((a, b) => a._min - b._min)
    .map(({ _min, ...rest }) => { void _min; return rest; });
}

export default function ShippingInsuranceForm({
  rates,
  region,
  itemType = "TRADING_CARD",
  unit,
}: {
  rates: ShippingInsuranceRate[];
  region: "PSA_JP" | "PSA_US";
  itemType?: "TRADING_CARD" | "UNOPENED_PACK" | "COMIC_MAGAZINE" | "AUTOGRAPH";
  unit: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [bands, setBands] = useState<Band[]>(() => {
    const b = toBands(rates.filter((r) => r.region === region && r.itemType === itemType));
    return b.length > 0 ? b : [{ minValue: "0", maxValue: "", fee8: "0", fee25: "0", surcharge: "0" }];
  });

  function update(i: number, patch: Partial<Band>) {
    setBands((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  }
  function addBand() {
    setBands((prev) => [...prev, { minValue: "", maxValue: "", fee8: "0", fee25: "0", surcharge: "0" }]);
  }
  function removeBand(i: number) {
    setBands((prev) => prev.filter((_, idx) => idx !== i));
  }

  function save() {
    setMessage("");
    startTransition(async () => {
      const payload = {
        bands: bands.map((b) => ({
          minValue: parseInt(b.minValue) || 0,
          maxValue: b.maxValue === "" ? null : parseInt(b.maxValue),
          fee8: parseInt(b.fee8) || 0,
          fee25: parseInt(b.fee25) || 0,
          surcharge: parseInt(b.surcharge) || 0,
        })),
      };
      const res = await saveShippingInsuranceRates({ region, itemType, ...payload });
      setMessage(res.success ? "保存しました" : res.error ?? "保存に失敗しました");
      if (res.success) router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        申告価格の合計金額帯ごとに、1〜8枚・9〜25枚の金額と、26枚以上の加算単価（{unit}/枚）を設定します（金額単位: {unit}）。
        26枚以上は「9〜25枚の金額 + 加算単価 ×（枚数 − 25）」で計算されます。上限を空欄にすると「上限なし」になります。
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 font-medium">
              <th className="text-left px-2 py-2">申告額 下限</th>
              <th className="text-left px-2 py-2">申告額 上限</th>
              <th className="text-left px-2 py-2">1〜8枚</th>
              <th className="text-left px-2 py-2">9〜25枚</th>
              <th className="text-left px-2 py-2">26枚〜 加算/枚</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {bands.map((b, i) => (
              <tr key={i}>
                <td className="px-2 py-2">
                  <input type="number" min={0} value={b.minValue} onChange={(e) => update(i, { minValue: e.target.value })} className={inputCls} />
                </td>
                <td className="px-2 py-2">
                  <input type="number" min={0} placeholder="上限なし" value={b.maxValue} onChange={(e) => update(i, { maxValue: e.target.value })} className={inputCls} />
                </td>
                <td className="px-2 py-2">
                  <input type="number" min={0} value={b.fee8} onChange={(e) => update(i, { fee8: e.target.value })} className={inputCls} />
                </td>
                <td className="px-2 py-2">
                  <input type="number" min={0} value={b.fee25} onChange={(e) => update(i, { fee25: e.target.value })} className={inputCls} />
                </td>
                <td className="px-2 py-2">
                  <input type="number" min={0} value={b.surcharge} onChange={(e) => update(i, { surcharge: e.target.value })} className={inputCls} />
                </td>
                <td className="px-2 py-2">
                  <button type="button" onClick={() => removeBand(i)} className="text-red-500 hover:text-red-700 text-sm">削除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={addBand} className="border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
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
