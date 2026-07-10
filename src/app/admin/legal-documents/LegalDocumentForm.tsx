"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateLegalDocument } from "@/actions/legal-document";

function toDateInputValue(date: Date | null): string {
  if (!date) return "";
  return new Date(date).toISOString().split("T")[0];
}

export default function LegalDocumentForm({
  id,
  initialTitle,
  initialBody,
  initialEstablishedAt,
  initialRevisedAt,
}: {
  id: string;
  initialTitle: string;
  initialBody: string;
  initialEstablishedAt: Date;
  initialRevisedAt: Date | null;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [establishedAt, setEstablishedAt] = useState(toDateInputValue(initialEstablishedAt));
  const [revisedAt, setRevisedAt] = useState(toDateInputValue(initialRevisedAt));
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    startTransition(async () => {
      const result = await updateLegalDocument({
        id,
        title: title.trim(),
        body,
        establishedAt: new Date(establishedAt),
        revisedAt: revisedAt ? new Date(revisedAt) : null,
      });
      if (result.success) {
        setMessage("保存しました");
        router.refresh();
      } else {
        setMessage(result.error ?? "保存に失敗しました");
      }
    });
  }

  const inputCls =
    "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">タイトル</label>
        <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">制定日</label>
          <input
            type="date"
            className={inputCls}
            value={establishedAt}
            onChange={(e) => setEstablishedAt(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">改訂日（任意）</label>
          <input type="date" className={inputCls} value={revisedAt} onChange={(e) => setRevisedAt(e.target.value)} />
        </div>
      </div>

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

      <button
        type="submit"
        disabled={isPending}
        className="bg-brand-600 text-white font-bold px-5 py-2.5 rounded-lg hover:bg-brand-700 transition disabled:opacity-50"
      >
        {isPending ? "保存中..." : "保存する"}
      </button>
    </form>
  );
}
