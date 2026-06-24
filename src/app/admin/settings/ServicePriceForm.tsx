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
  pricePerCard: string;
  maxDeclaredValue: string;
  isActive: boolean;
};

type Row = { serviceLevel: string; order: number; jp?: Cell; us?: Cell };

const inputCls = "w-24 border border-gray-300 rounded px-2 py-1 text-sm text-gray-900";

export default function ServicePriceForm({ servicePrices }: { servicePrices: ServicePrice[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const [rows, setRows] = useState<Row[]>(() => {
    const map = new Map<string, Row>();
    for (const sp of servicePrices) {
      const cell: Cell = {
        id: sp.id,
        pricePerCard: String(sp.pricePerCard),
        maxDeclaredValue: sp.maxDeclaredValue === null ? "" : String(sp.maxDeclaredValue),
        isActive: sp.isActive,
      };
      const row = map.get(sp.serviceLevel) ?? { serviceLevel: sp.serviceLevel, order: sp.pricePerCard };
      if (sp.region === "PSA_JP") {
        row.jp = cell;
        row.order = sp.pricePerCard;
      } else if (sp.region === "PSA_US") {
        row.us = cell;
      }
      map.set(sp.serviceLevel, row);
    }
    return Array.from(map.values()).sort((a, b) => a.order - b.order);
  });

  function updateCell(serviceLevel: string, region: "jp" | "us", patch: Partial<Cell>) {
    setRows((prev) =>
      prev.map((r) =>
        r.serviceLevel === serviceLevel && r[region] ? { ...r, [region]: { ...r[region]!, ...patch } } : r
      )
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setSaved(false);

    const updates: {
      id: string;
      pricePerCard: number;
      maxDeclaredValue: number | null;
      isActive: boolean;
    }[] = [];
    for (const r of rows) {
      for (const cell of [r.jp, r.us]) {
        if (!cell) continue;
        updates.push({
          id: cell.id,
          pricePerCard: parseInt(cell.pricePerCard) || 0,
          maxDeclaredValue: cell.maxDeclaredValue === "" ? null : parseInt(cell.maxDeclaredValue),
          isActive: cell.isActive,
        });
      }
    }

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

  function CellInputs({ serviceLevel, region, cell }: { serviceLevel: string; region: "jp" | "us"; cell?: Cell }) {
    if (!cell) {
      return (
        <>
          {Array.from({ length: 3 }).map((_, i) => (
            <td key={i} className="px-2 py-3 text-gray-300">—</td>
          ))}
        </>
      );
    }
    const numInput = (key: keyof Cell, placeholder?: string) => (
      <td className="px-2 py-3">
        <input
          type="number"
          min={0}
          placeholder={placeholder}
          value={cell[key] as string}
          onChange={(e) => updateCell(serviceLevel, region, { [key]: e.target.value })}
          className={inputCls}
        />
      </td>
    );
    return (
      <>
        {numInput("pricePerCard")}
        {numInput("maxDeclaredValue", "なし")}
        <td className="px-2 py-3 text-center">
          <input
            type="checkbox"
            checked={cell.isActive}
            onChange={(e) => updateCell(serviceLevel, region, { isActive: e.target.checked })}
          />
        </td>
      </>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <p className="text-xs text-gray-500">
        鑑定料は1枚あたりの金額です。代理入力料金・事務手数料は別セクション（サービス共通の一律額）で設定します。
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th rowSpan={2} className="text-left px-3 py-2 text-gray-600 font-medium align-bottom">サービス</th>
              <th colSpan={3} className="text-center px-3 py-2 text-gray-700 font-bold border-l border-gray-200">PSA 日本</th>
              <th colSpan={3} className="text-center px-3 py-2 text-gray-700 font-bold border-l border-gray-200">PSA US</th>
            </tr>
            <tr className="bg-gray-50 text-gray-500 font-medium">
              {(["jp", "us"] as const).map((rg) => (
                <th key={rg} colSpan={3} className="p-0">
                  <div className="grid grid-cols-3 border-l border-gray-200">
                    <span className="px-2 py-2 text-left">鑑定料</span>
                    <span className="px-2 py-2 text-left">上限</span>
                    <span className="px-2 py-2 text-center">表示</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.serviceLevel}>
                <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap">
                  {SERVICE_LABELS[r.serviceLevel] ?? r.serviceLevel}
                </td>
                <CellInputs serviceLevel={r.serviceLevel} region="jp" cell={r.jp} />
                <CellInputs serviceLevel={r.serviceLevel} region="us" cell={r.us} />
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
