"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AutographPricing } from "@prisma/client";
import { saveAutographPricing } from "@/actions/pricing";

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

type Cell = { id: string; serviceLevel: string; order: number; fee: string; isActive: boolean };

const inputCls = "w-28 border border-gray-300 rounded px-2 py-1 text-sm text-gray-900";

export default function AutographPricingForm({
  pricing,
  unit,
}: {
  pricing: AutographPricing[];
  unit: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const [cells, setCells] = useState<Cell[]>(() =>
    pricing
      .map((p) => ({
        id: p.id,
        serviceLevel: p.serviceLevel,
        order: p.fee,
        fee: String(p.fee),
        isActive: p.isActive,
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

    const res = await saveAutographPricing({
      rows: cells.map((c) => ({
        id: c.id,
        fee: Math.round((parseFloat(c.fee) || 0) * 100) / 100,
        isActive: c.isActive,
      })),
    });

    setLoading(false);
    if (res.success) {
      setSaved(true);
      router.refresh();
    } else {
      alert(res.error ?? "保存に失敗しました");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-xs text-gray-500">
        オートグラフ（デュアルサービス）認証の追加料金です。1枚あたりの金額（{unit}）。サービスレベルごとに設定できます。
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 font-medium">
            <tr>
              <th className="text-left px-3 py-2">サービス</th>
              <th className="text-left px-3 py-2">追加料金（{unit}）</th>
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
                  <input type="number" min={0} step="0.01" value={c.fee} onChange={(e) => update(c.id, { fee: e.target.value })} className={inputCls} />
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
