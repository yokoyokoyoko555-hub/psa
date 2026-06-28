"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CardNameMaster } from "@prisma/client";
import { saveCardNameMaster, deleteCardNameMaster } from "@/actions/card-master";

const LANG_LABELS: Record<string, string> = { JAPANESE: "日本語", ENGLISH: "英語" };
const inputCls = "border border-gray-300 rounded px-2 py-1 text-sm text-gray-900";

type Draft = {
  id?: string;
  tcgTitle: string;
  cardName: string;
  cardNumber: string;
  rarity: string;
  language: "JAPANESE" | "ENGLISH";
};

function empty(): Draft {
  return { tcgTitle: "", cardName: "", cardNumber: "", rarity: "", language: "JAPANESE" };
}

export default function CardMasterManager({ masters }: { masters: CardNameMaster[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<Draft>(empty());
  const [editId, setEditId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const filtered = masters.filter((m) => {
    if (!q.trim()) return true;
    const t = q.toLowerCase();
    return (
      m.cardName.toLowerCase().includes(t) ||
      (m.cardNumber ?? "").toLowerCase().includes(t) ||
      (m.tcgTitle ?? "").toLowerCase().includes(t)
    );
  });

  function save() {
    if (!draft.cardName.trim()) {
      setMessage("カード名を入力してください");
      return;
    }
    setMessage("");
    startTransition(async () => {
      const res = await saveCardNameMaster({
        id: editId ?? undefined,
        tcgTitle: draft.tcgTitle || undefined,
        cardName: draft.cardName,
        cardNumber: draft.cardNumber || undefined,
        rarity: draft.rarity || undefined,
        language: draft.language,
      });
      if (res.success) {
        setDraft(empty());
        setEditId(null);
        router.refresh();
      } else {
        setMessage(res.error ?? "保存に失敗しました");
      }
    });
  }

  function edit(m: CardNameMaster) {
    setEditId(m.id);
    setDraft({
      tcgTitle: m.tcgTitle ?? "",
      cardName: m.cardName,
      cardNumber: m.cardNumber ?? "",
      rarity: m.rarity ?? "",
      language: (m.language as Draft["language"]) ?? "JAPANESE",
    });
  }

  function remove(id: string) {
    if (!confirm("削除しますか？")) return;
    startTransition(async () => {
      await deleteCardNameMaster(id);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* 追加/編集フォーム */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <p className="font-bold text-gray-900">{editId ? "カードを編集" : "カードを追加"}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input className={inputCls} placeholder="カード名（必須）" value={draft.cardName} onChange={(e) => setDraft({ ...draft, cardName: e.target.value })} />
          <input className={inputCls} placeholder="タイトル/セット名" value={draft.tcgTitle} onChange={(e) => setDraft({ ...draft, tcgTitle: e.target.value })} />
          <input className={inputCls} placeholder="カード番号" value={draft.cardNumber} onChange={(e) => setDraft({ ...draft, cardNumber: e.target.value })} />
          <input className={inputCls} placeholder="レアリティ" value={draft.rarity} onChange={(e) => setDraft({ ...draft, rarity: e.target.value })} />
          <select className={inputCls} value={draft.language} onChange={(e) => setDraft({ ...draft, language: e.target.value as Draft["language"] })}>
            <option value="JAPANESE">日本語</option>
            <option value="ENGLISH">英語</option>
          </select>
        </div>
        {message && <p className="text-sm text-red-600">{message}</p>}
        <div className="flex items-center justify-end gap-3">
          {editId && (
            <button onClick={() => { setEditId(null); setDraft(empty()); }} className="text-sm text-gray-500 hover:text-gray-700">キャンセル</button>
          )}
          <button onClick={save} disabled={isPending} className="bg-brand-600 text-white font-bold px-6 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50 text-sm">
            {isPending ? "保存中..." : "保存"}
          </button>
        </div>
      </div>

      {/* 検索＋一覧 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <input className={`${inputCls} w-full max-w-sm`} placeholder="検索（カード名・番号・タイトル）" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="text-sm text-gray-400 shrink-0">{filtered.length} 件</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-2 py-2">カード名</th>
                <th className="text-left px-2 py-2">タイトル</th>
                <th className="text-left px-2 py-2">番号</th>
                <th className="text-left px-2 py-2">レア</th>
                <th className="text-left px-2 py-2">言語</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.slice(0, 300).map((m) => (
                <tr key={m.id}>
                  <td className="px-2 py-2 font-medium text-gray-900">{m.cardName}</td>
                  <td className="px-2 py-2 text-gray-600">{m.tcgTitle}</td>
                  <td className="px-2 py-2 text-gray-600">{m.cardNumber}</td>
                  <td className="px-2 py-2 text-gray-600">{m.rarity}</td>
                  <td className="px-2 py-2 text-gray-600">{LANG_LABELS[m.language] ?? m.language}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    <button onClick={() => edit(m)} className="text-brand-600 hover:underline mr-2">編集</button>
                    <button onClick={() => remove(m.id)} className="text-red-500 hover:underline">削除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
