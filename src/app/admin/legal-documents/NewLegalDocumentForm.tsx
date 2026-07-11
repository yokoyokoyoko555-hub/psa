"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createLegalDocument } from "@/actions/legal-document";

export default function NewLegalDocumentForm() {
  const router = useRouter();
  const [id, setId] = useState("");
  const [title, setTitle] = useState("");
  const [establishedAt, setEstablishedAt] = useState(new Date().toISOString().split("T")[0]);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const inputCls =
    "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    startTransition(async () => {
      const result = await createLegalDocument({
        id: id.trim(),
        title: title.trim(),
        establishedAt: new Date(establishedAt),
      });
      if (result.success) {
        setId("");
        setTitle("");
        router.refresh();
      } else {
        setMessage(result.error ?? "作成に失敗しました");
      }
    });
  }

  return (
    <details className="bg-white rounded-xl border border-gray-200 p-6">
      <summary className="text-lg font-bold text-gray-900 cursor-pointer select-none">新規作成</summary>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              スラッグ（URL用・半角英数字とハイフン）
            </label>
            <input
              className={inputCls}
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="例: returns-policy"
              required
            />
            <p className="text-xs text-gray-400 mt-1">公開URL: /legal/{id || "..."}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">タイトル</label>
            <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
        </div>
        <div className="w-40">
          <label className="block text-sm font-medium text-gray-700 mb-1">制定日</label>
          <input
            type="date"
            className={inputCls}
            value={establishedAt}
            onChange={(e) => setEstablishedAt(e.target.value)}
            required
          />
        </div>
        {message && <p className="text-sm text-red-600">{message}</p>}
        <button
          type="submit"
          disabled={isPending}
          className="bg-brand-600 text-white font-bold px-5 py-2.5 rounded-lg hover:bg-brand-700 transition disabled:opacity-50"
        >
          {isPending ? "作成中..." : "作成する"}
        </button>
      </form>
    </details>
  );
}
