"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateLegalDocument, deleteLegalDocument } from "@/actions/legal-document";

function toDateInputValue(date: Date): string {
  return new Date(date).toISOString().split("T")[0];
}

export default function LegalDocumentForm({
  id,
  initialTitle,
  initialFooterLabel,
  initialBody,
  initialEstablishedAt,
  initialRevisedAt,
  initialShowInFooter,
}: {
  id: string;
  initialTitle: string;
  initialFooterLabel: string;
  initialBody: string;
  initialEstablishedAt: Date;
  initialRevisedAt: Date[];
  initialShowInFooter: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [footerLabel, setFooterLabel] = useState(initialFooterLabel);
  const [body, setBody] = useState(initialBody);
  const [establishedAt, setEstablishedAt] = useState(toDateInputValue(initialEstablishedAt));
  const [revisedDates, setRevisedDates] = useState(initialRevisedAt.map(toDateInputValue).sort());
  const [newRevisedDate, setNewRevisedDate] = useState("");
  const [showInFooter, setShowInFooter] = useState(initialShowInFooter);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const inputCls =
    "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500";

  function addRevisedDate() {
    if (!newRevisedDate || revisedDates.includes(newRevisedDate)) return;
    setRevisedDates([...revisedDates, newRevisedDate].sort());
    setNewRevisedDate("");
  }

  function removeRevisedDate(date: string) {
    setRevisedDates(revisedDates.filter((d) => d !== date));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    startTransition(async () => {
      const result = await updateLegalDocument({
        id,
        title: title.trim(),
        footerLabel: footerLabel.trim(),
        body,
        establishedAt: new Date(establishedAt),
        revisedAt: revisedDates.map((d) => new Date(d)),
        showInFooter,
      });
      if (result.success) {
        setMessage("保存しました");
        router.refresh();
      } else {
        setMessage(result.error ?? "保存に失敗しました");
      }
    });
  }

  function handleDelete() {
    if (!confirm(`「${title}」を削除します。よろしいですか？`)) return;
    setMessage("");
    startTransition(async () => {
      const result = await deleteLegalDocument({ id });
      if (result.success) {
        router.refresh();
      } else {
        setMessage(result.error ?? "削除に失敗しました");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          タイトル（ページ見出し・ブラウザタブに使用）
        </label>
        <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          フッター表示名（短い表記。例: 利用規約）
        </label>
        <input
          className={inputCls}
          value={footerLabel}
          onChange={(e) => setFooterLabel(e.target.value)}
          maxLength={60}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">制定日</label>
        <input
          type="date"
          className={`${inputCls} w-40`}
          value={establishedAt}
          onChange={(e) => setEstablishedAt(e.target.value)}
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">改訂日（複数回分を記録できます）</label>
        {revisedDates.length > 0 && (
          <ul className="flex flex-wrap gap-2 mb-2">
            {revisedDates.map((d) => (
              <li key={d} className="flex items-center gap-1 bg-gray-100 rounded-full px-3 py-1 text-sm text-gray-700">
                {d}
                <button
                  type="button"
                  onClick={() => removeRevisedDate(d)}
                  className="text-gray-400 hover:text-red-600"
                  aria-label={`${d}を削除`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-2">
          <input
            type="date"
            className={`${inputCls} w-40`}
            value={newRevisedDate}
            onChange={(e) => setNewRevisedDate(e.target.value)}
          />
          <button
            type="button"
            onClick={addRevisedDate}
            disabled={!newRevisedDate}
            className="border border-gray-300 text-gray-700 font-medium px-3 py-2 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            改訂日を追加
          </button>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={showInFooter} onChange={(e) => setShowInFooter(e.target.checked)} className="h-4 w-4" />
        フッターにリンクを表示する
      </label>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          本文（Markdown: ## 見出し / * 箇条書き / **太字**）
        </label>
        <textarea
          className={`${inputCls} min-h-96 font-mono text-xs`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>

      {message && <p className="text-sm text-gray-600">{message}</p>}

      <div className="flex items-center justify-between">
        <button
          type="submit"
          disabled={isPending}
          className="bg-brand-600 text-white font-bold px-5 py-2.5 rounded-lg hover:bg-brand-700 transition disabled:opacity-50"
        >
          {isPending ? "保存中..." : "保存する"}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          className="text-red-600 text-sm font-medium hover:text-red-700 disabled:opacity-50"
        >
          この文書を削除
        </button>
      </div>
    </form>
  );
}
