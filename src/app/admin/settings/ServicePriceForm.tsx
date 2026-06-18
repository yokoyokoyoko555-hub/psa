"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { prisma } from "@/lib/prisma";
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

export default function ServicePriceForm({ servicePrices }: { servicePrices: ServicePrice[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);

    const updates = servicePrices.map((sp) => ({
      id: sp.id,
      pricePerCard: parseInt(fd.get(`price_${sp.serviceLevel}`) as string),
      agencyFee: parseInt(fd.get(`agency_${sp.serviceLevel}`) as string),
    }));

    await fetch("/api/admin/service-prices", {
      method: "PUT",
      body: JSON.stringify(updates),
      headers: { "Content-Type": "application/json" },
    });

    router.refresh();
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit}>
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left px-3 py-2 text-gray-600 font-medium">サービス</th>
            <th className="text-left px-3 py-2 text-gray-600 font-medium">鑑定料（/枚）</th>
            <th className="text-left px-3 py-2 text-gray-600 font-medium">代行手数料（/枚）</th>
            <th className="text-left px-3 py-2 text-gray-600 font-medium">申告価格上限</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {servicePrices.map((sp) => (
            <tr key={sp.serviceLevel}>
              <td className="px-3 py-3 font-medium">{SERVICE_LABELS[sp.serviceLevel]}</td>
              <td className="px-3 py-3">
                <input
                  type="number"
                  name={`price_${sp.serviceLevel}`}
                  defaultValue={sp.pricePerCard}
                  min={0}
                  className="w-32 border border-gray-300 rounded px-2 py-1 text-sm"
                />
              </td>
              <td className="px-3 py-3">
                <input
                  type="number"
                  name={`agency_${sp.serviceLevel}`}
                  defaultValue={sp.agencyFee}
                  min={0}
                  className="w-32 border border-gray-300 rounded px-2 py-1 text-sm"
                />
              </td>
              <td className="px-3 py-3 text-gray-600">
                {sp.maxDeclaredValue === null
                  ? "なし"
                  : `¥${sp.maxDeclaredValue.toLocaleString()}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="submit"
        disabled={loading}
        className="mt-4 bg-brand-600 text-white font-bold px-6 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition text-sm"
      >
        {loading ? "保存中..." : "保存"}
      </button>
    </form>
  );
}
