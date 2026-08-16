"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ListingDurationOption, SalesPlatform } from "@prisma/client";
import { saveListingDurationOption, deleteListingDurationOption } from "@/actions/ebay-settings";

type Draft = {
  id?: string;
  days: string;
  label: string;
  isActive: boolean;
  sortOrder: string;
};

function emptyDraft(nextSortOrder: number): Draft {
  return { days: "30", label: "", isActive: true, sortOrder: String(nextSortOrder) };
}

const inputCls = "border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 w-full";

/** 買取契約の有効期限パターン（出品維持日数）の管理画面CRUD。ADR-0081/0087 */
export default function ListingDurationOptionForm({
  platform,
  options,
}: {
  platform: SalesPlatform;
  options: ListingDurationOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState("");

  const rows = [...options].sort((a, b) => a.sortOrder - b.sortOrder);

  function edit(o: ListingDurationOption) {
    setDraft({
      id: o.id,
      days: String(o.days),
      label: o.label,
      isActive: o.isActive,
      sortOrder: String(o.sortOrder),
    });
    setMessage("");
  }

  function save() {
    if (!draft) return;
    if (!draft.label.trim()) {
      setMessage("表示名を入力してください");
      return;
    }
    setMessage("");
    startTransition(async () => {
      const res = await saveListingDurationOption({
        id: draft.id,
        platform,
        days: parseInt(draft.days) || 0,
        label: draft.label.trim(),
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
    if (!confirm("この有効期限パターンを削除しますか？")) return;
    startTransition(async () => {
      await deleteListingDurationOption(id);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        買取契約の有効期限（＝出品を維持する日数）を、顧客が申請時に選べるパターンとして設定します。
      </p>

      <div className="space-y-2">
        {rows.length === 0 && <p className="text-sm text-gray-400">未登録です。</p>}
        {rows.map((o) => (
          <div
            key={o.id}
            className={`flex items-center justify-between gap-3 border rounded-lg p-3 text-sm ${
              o.isActive ? "border-gray-100" : "border-gray-100 bg-gray-100"
            }`}
          >
            <div className="min-w-0">
              <p className="font-bold text-gray-900">
                {o.label}
                {!o.isActive && <span className="ml-2 text-xs text-gray-400">(非表示)</span>}
              </p>
              <p className="text-gray-500">{o.days}日間</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => edit(o)} className="text-brand-600 hover:underline">編集</button>
              <button onClick={() => remove(o.id)} className="text-red-500 hover:underline">削除</button>
            </div>
          </div>
        ))}
      </div>

      {draft ? (
        <div className="border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm space-y-1">
              <span className="text-gray-700">表示名</span>
              <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} className={inputCls} placeholder="例: お試し" />
            </label>
            <label className="text-sm space-y-1">
              <span className="text-gray-700">日数</span>
              <input type="number" min={1} max={365} value={draft.days} onChange={(e) => setDraft({ ...draft, days: e.target.value })} className={inputCls} />
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
