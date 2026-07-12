"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PsaProgressStatus } from "@prisma/client";
import { savePsaProgressStatus, deletePsaProgressStatus } from "@/actions/psa-progress";

type Draft = {
  id?: string;
  name: string;
  sortOrder: string;
  isActive: boolean;
};

function emptyDraft(nextSortOrder: number): Draft {
  return { name: "", sortOrder: String(nextSortOrder), isActive: true };
}

const inputCls = "border border-gray-300 rounded px-2 py-1 text-sm text-gray-900";

export default function PsaProgressStatusForm({ statuses }: { statuses: PsaProgressStatus[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState("");

  function edit(s: PsaProgressStatus) {
    setDraft({ id: s.id, name: s.name, sortOrder: String(s.sortOrder), isActive: s.isActive });
    setMessage("");
  }

  function save() {
    if (!draft) return;
    setMessage("");
    startTransition(async () => {
      const res = await savePsaProgressStatus({
        id: draft.id,
        name: draft.name,
        sortOrder: parseInt(draft.sortOrder) || 0,
        isActive: draft.isActive,
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
    if (!confirm("このステータスを削除しますか？")) return;
    startTransition(async () => {
      await deletePsaProgressStatus(id);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        「PSA受領済み」以降、PSA提出グループに一括反映できるステータス名を管理します。PSA側の進捗表記が増えたらここに追加してください。
      </p>

      <div className="space-y-2">
        {statuses.length === 0 && <p className="text-sm text-gray-400">ステータスは未登録です。</p>}
        {statuses.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 border border-gray-100 rounded-lg p-3 text-sm">
            <div className="min-w-0">
              <p className="font-bold text-gray-900">
                {s.name}
                {!s.isActive && <span className="ml-2 text-xs text-gray-400">(無効)</span>}
              </p>
              <p className="text-gray-500">表示順: {s.sortOrder}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => edit(s)} className="text-brand-600 hover:underline">編集</button>
              <button onClick={() => remove(s.id)} className="text-red-500 hover:underline">削除</button>
            </div>
          </div>
        ))}
      </div>

      {draft ? (
        <div className="border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm space-y-1">
              <span className="text-gray-700">ステータス名</span>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={`${inputCls} w-full`} placeholder="例: PSA受領済み" />
            </label>
            <label className="text-sm space-y-1">
              <span className="text-gray-700">表示順</span>
              <input type="number" value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })} className={`${inputCls} w-full`} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />
            有効
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
          <button onClick={() => setDraft(emptyDraft(statuses.length))} className="border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            ＋ ステータスを追加
          </button>
        </div>
      )}
    </div>
  );
}
