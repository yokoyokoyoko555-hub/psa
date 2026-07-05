"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CustomServicePrice } from "@prisma/client";
import { saveCustomServicePrice, deleteCustomServicePrice } from "@/actions/pricing";
import { formatMoney, formatMoneyInt } from "@/lib/currency";

type Draft = {
  id?: string;
  name: string;
  pricePerCard: string;
  cost: string;
  maxDeclaredValue: string; // ""=上限なし
  isActive: boolean;
  sortOrder: string;
};

function emptyDraft(nextSortOrder: number): Draft {
  return { name: "", pricePerCard: "0", cost: "0", maxDeclaredValue: "", isActive: true, sortOrder: String(nextSortOrder) };
}

const inputCls = "border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 w-full";

export default function CustomServicePriceForm({
  items,
  category,
  region,
}: {
  items: CustomServicePrice[];
  category: "TRADING_CARD" | "UNOPENED_PACK" | "COMIC_MAGAZINE" | "AUTOGRAPH";
  region: "PSA_JP" | "PSA_US";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState("");

  const rows = items
    .filter((i) => i.category === category && i.region === region)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // 価格・原価: PSA_USのみドル建て・小数点2桁。PSA_JP（トレカ）は円建て・整数。ADR-0026
  const priceStep = region === "PSA_US" ? "0.01" : "1";
  const currencySymbol = region === "PSA_US" ? "$" : "円";
  const parsePrice = (v: string) => (region === "PSA_US" ? parseFloat(v) || 0 : parseInt(v) || 0);

  function edit(i: CustomServicePrice) {
    setDraft({
      id: i.id,
      name: i.name,
      pricePerCard: String(i.pricePerCard),
      cost: String(i.cost),
      maxDeclaredValue: i.maxDeclaredValue === null ? "" : String(i.maxDeclaredValue),
      isActive: i.isActive,
      sortOrder: String(i.sortOrder),
    });
    setMessage("");
  }

  function save() {
    if (!draft) return;
    if (!draft.name.trim()) {
      setMessage("名称を入力してください");
      return;
    }
    setMessage("");
    startTransition(async () => {
      const res = await saveCustomServicePrice({
        id: draft.id,
        category,
        region,
        name: draft.name.trim(),
        pricePerCard: parsePrice(draft.pricePerCard),
        cost: parsePrice(draft.cost),
        maxDeclaredValue: draft.maxDeclaredValue === "" ? null : parseInt(draft.maxDeclaredValue) || 0,
        isActive: draft.isActive,
        sortOrder: parseInt(draft.sortOrder) || 0,
      });
      if (res.success) {
        setDraft(null);
        router.refresh();
      } else {
        setMessage(res.error ?? "保存に失敗しました");
      }
    });
  }

  function remove(id: string) {
    if (!confirm("このサービスを削除しますか？（過去の申込には名称が残ります）")) return;
    startTransition(async () => {
      await deleteCustomServicePrice(id);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        価格・原価は{region === "PSA_US" ? "USD・小数点以下2桁" : "円・整数"}、申告上限は{currencySymbol}・整数（小数点なし・空欄=上限なし）です。
      </p>

      <div className="space-y-2">
        {rows.length === 0 && <p className="text-sm text-gray-400">未登録です。</p>}
        {rows.map((i) => (
          <div
            key={i.id}
            className={`flex items-center justify-between gap-3 border rounded-lg p-3 text-sm ${
              i.isActive ? "border-gray-100" : "border-gray-100 bg-gray-100"
            }`}
          >
            <div className="min-w-0 flex items-baseline gap-2 whitespace-nowrap overflow-x-auto">
              <p className="font-bold text-gray-900 shrink-0">
                {i.name}
                {!i.isActive && <span className="ml-2 text-xs text-gray-400">(無効)</span>}
              </p>
              <p className="text-gray-500 shrink-0">
                {formatMoney(i.pricePerCard, region)}/枚 ・ 原価{formatMoney(i.cost, region)} ・ 申告上限{" "}
                {i.maxDeclaredValue === null ? "なし" : formatMoneyInt(i.maxDeclaredValue, region)}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => edit(i)} className="text-brand-600 hover:underline">編集</button>
              <button onClick={() => remove(i.id)} className="text-red-500 hover:underline">削除</button>
            </div>
          </div>
        ))}
      </div>

      {draft ? (
        <div className="border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm space-y-1 sm:col-span-2">
              <span className="text-gray-700">名称</span>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputCls} placeholder="例: スタンダード" />
            </label>
            <label className="text-sm space-y-1">
              <span className="text-gray-700">価格（{currencySymbol}/枚）</span>
              <input type="number" min={0} step={priceStep} value={draft.pricePerCard} onChange={(e) => setDraft({ ...draft, pricePerCard: e.target.value })} className={inputCls} />
            </label>
            <label className="text-sm space-y-1">
              <span className="text-gray-700">原価（{currencySymbol}/枚）</span>
              <input type="number" min={0} step={priceStep} value={draft.cost} onChange={(e) => setDraft({ ...draft, cost: e.target.value })} className={inputCls} />
            </label>
            <label className="text-sm space-y-1">
              <span className="text-gray-700">申告上限（{currencySymbol}・整数・空欄=上限なし）</span>
              <input type="number" min={0} step="1" placeholder="なし" value={draft.maxDeclaredValue} onChange={(e) => setDraft({ ...draft, maxDeclaredValue: e.target.value })} className={inputCls} />
            </label>
            <label className="text-sm space-y-1">
              <span className="text-gray-700">表示順</span>
              <input type="number" value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })} className={inputCls} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />
            有効（顧客画面に表示する）
          </label>
          {message && <p className="text-sm text-red-600">{message}</p>}
          <div className="flex items-center justify-end gap-3">
            <button onClick={() => setDraft(null)} className="text-sm text-gray-500 hover:text-gray-700">キャンセル</button>
            <button onClick={save} disabled={isPending} className="bg-brand-600 text-white font-bold px-6 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50 text-sm">
              {isPending ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end">
          <button onClick={() => setDraft(emptyDraft(rows.length))} className="border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            ＋ 追加
          </button>
        </div>
      )}
    </div>
  );
}
