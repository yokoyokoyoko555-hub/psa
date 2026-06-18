"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ServicePrice } from "@prisma/client";

const SERVICE_LABELS: Record<string, string> = {
  VALUE: "バリュー",
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

const REGION_LABELS: Record<string, string> = {
  PSA_JP: "PSA 日本",
  PSA_US: "PSA US",
};

export default function ServicePriceForm({ servicePrices }: { servicePrices: ServicePrice[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setSaved(false);
    const fd = new FormData(e.currentTarget);

    const updates = servicePrices.map((sp) => {
      const maxRaw = fd.get(`max_${sp.id}`) as string;
      return {
        id: sp.id,
        pricePerCard: parseInt(fd.get(`price_${sp.id}`) as string),
        agencyFee: parseInt(fd.get(`agency_${sp.id}`) as string),
        maxDeclaredValue: maxRaw === "" ? null : parseInt(maxRaw),
      };
    });

    await fetch("/api/admin/service-prices", {
      method: "PUT",
      body: JSON.stringify(updates),
      headers: { "Content-Type": "application/json" },
    });

    router.refresh();
    setLoading(false);
    setSaved(true);
  }

  // 地域ごとにグループ化
  const regions = Array.from(new Set(servicePrices.map((p) => p.region)));

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {regions.map((region) => (
        <div key={region}>
          <h3 className="font-bold text-gray-900 mb-2">{REGION_LABELS[region] ?? region}</h3>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2 text-gray-600 font-medium">サービス</th>
                <th className="text-left px-3 py-2 text-gray-600 font-medium">鑑定料（/枚）</th>
                <th className="text-left px-3 py-2 text-gray-600 font-medium">代行手数料（/枚）</th>
                <th className="text-left px-3 py-2 text-gray-600 font-medium">申告価格上限（空欄=なし）</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {servicePrices
                .filter((sp) => sp.region === region)
                .map((sp) => (
                  <tr key={sp.id}>
                    <td className="px-3 py-3 font-medium text-gray-900">
                      {SERVICE_LABELS[sp.serviceLevel] ?? sp.serviceLevel}
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="number"
                        name={`price_${sp.id}`}
                        defaultValue={sp.pricePerCard}
                        min={0}
                        className="w-32 border border-gray-300 rounded px-2 py-1 text-sm text-gray-900"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="number"
                        name={`agency_${sp.id}`}
                        defaultValue={sp.agencyFee}
                        min={0}
                        className="w-32 border border-gray-300 rounded px-2 py-1 text-sm text-gray-900"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="number"
                        name={`max_${sp.id}`}
                        defaultValue={sp.maxDeclaredValue ?? ""}
                        min={0}
                        placeholder="なし"
                        className="w-36 border border-gray-300 rounded px-2 py-1 text-sm text-gray-900"
                      />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ))}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="bg-brand-600 text-white font-bold px-6 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition text-sm"
        >
          {loading ? "保存中..." : "保存"}
        </button>
        {saved && <span className="text-green-700 text-sm">保存しました</span>}
      </div>
    </form>
  );
}
