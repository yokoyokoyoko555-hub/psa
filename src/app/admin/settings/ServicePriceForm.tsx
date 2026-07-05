"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ServicePrice } from "@prisma/client";

const SERVICE_LABELS: Record<string, string> = {
  VALUE: "バリュー",
  VALUE_BULK: "バリューバルク",
  VALUE_PLUS: "バリュープラス",
  VALUE_MAX: "バリューマックス",
  REGULAR: "レギュラー",
  EXPRESS: "エクスプレス",
  SUPER_EXPRESS: "スーパー・エクスプレス",
  WALK_THROUGH: "ウォーク・スルー",
  PREMIUM_1: "プレミアム 1",
  PREMIUM_2: "プレミアム 2",
  PREMIUM_3: "プレミアム 3",
  PREMIUM_5: "プレミアム 5",
  PREMIUM_10: "プレミアム 10",
};

type Cell = {
  id: string;
  serviceLevel: string;
  order: number;
  pricePerCard: string;
  cost: string;
  maxDeclaredValue: string;
  isActive: boolean;
};

const inputCls = "w-28 border border-gray-300 rounded px-2 py-1 text-sm text-gray-900";

export default function ServicePriceForm({
  servicePrices,
  region,
  itemType = "TRADING_CARD",
  unit,
}: {
  servicePrices: ServicePrice[];
  region: string;
  itemType?: string;
  unit: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const isUsd = region === "PSA_US";
  const numStep = isUsd ? "0.01" : "1";

  const [cells, setCells] = useState<Cell[]>(() =>
    servicePrices
      .filter((sp) => sp.region === region && sp.itemType === itemType)
      .map((sp) => ({
        id: sp.id,
        serviceLevel: sp.serviceLevel,
        order: sp.pricePerCard,
        pricePerCard: String(sp.pricePerCard),
        cost: String(sp.cost),
        maxDeclaredValue: sp.maxDeclaredValue === null ? "" : String(sp.maxDeclaredValue),
        isActive: sp.isActive,
      }))
      .sort((a, b) => a.order - b.order),
  );

  function update(id: string, patch: Partial<Cell>) {
    setCells((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setSaved(false);

    const parseAmount = isUsd
      ? (v: string) => Math.round((parseFloat(v) || 0) * 100) / 100
      : (v: string) => parseInt(v) || 0;
    // 申告上限は常に円・整数（リージョンに関わらず）。ADR-0025
    const parseCap = (v: string) => parseInt(v) || 0;

    const updates = cells.map((c) => ({
      id: c.id,
      pricePerCard: parseAmount(c.pricePerCard),
      cost: parseAmount(c.cost),
      maxDeclaredValue: c.maxDeclaredValue === "" ? null : parseCap(c.maxDeclaredValue),
      isActive: c.isActive,
    }));

    const res = await fetch("/api/admin/service-prices", {
      method: "PUT",
      body: JSON.stringify(updates),
      headers: { "Content-Type": "application/json" },
    });

    setLoading(false);
    if (res.ok) {
      setSaved(true);
      router.refresh();
    } else {
      alert("保存に失敗しました");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-xs text-gray-500">鑑定料・原価は1枚あたりの金額です（{unit}）。申告上限は常に円・整数です。</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 font-medium">
            <tr>
              <th className="text-left px-3 py-2">サービス</th>
              <th className="text-left px-3 py-2">鑑定料（{unit}）</th>
              <th className="text-left px-3 py-2">原価（{unit}）</th>
              <th className="text-left px-3 py-2">申告上限（円）</th>
              <th className="text-center px-3 py-2">表示</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {cells.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">
                  {SERVICE_LABELS[c.serviceLevel] ?? c.serviceLevel}
                </td>
                <td className="px-3 py-2">
                  <input type="number" min={0} step={numStep} value={c.pricePerCard} onChange={(e) => update(c.id, { pricePerCard: e.target.value })} className={inputCls} />
                </td>
                <td className="px-3 py-2">
                  <input type="number" min={0} step={numStep} value={c.cost} onChange={(e) => update(c.id, { cost: e.target.value })} className={inputCls} />
                </td>
                <td className="px-3 py-2">
                  <input type="number" min={0} step="1" placeholder="なし" value={c.maxDeclaredValue} onChange={(e) => update(c.id, { maxDeclaredValue: e.target.value })} className={inputCls} />
                </td>
                <td className="px-3 py-2 text-center">
                  <input type="checkbox" checked={c.isActive} onChange={(e) => update(c.id, { isActive: e.target.checked })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-3">
        {saved && <span className="text-green-700 text-sm">保存しました</span>}
        <button
          type="submit"
          disabled={loading}
          className="bg-brand-600 text-white font-bold px-6 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition text-sm"
        >
          {loading ? "保存中..." : "保存"}
        </button>
      </div>
    </form>
  );
}
