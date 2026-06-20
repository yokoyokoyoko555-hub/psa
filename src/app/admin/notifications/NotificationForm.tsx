"use client";

import type { FormEvent } from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createNotification } from "@/actions/notification";

const inputCls =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500";

export default function NotificationForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    startTransition(async () => {
      const result = await createNotification({ title: title.trim(), body: body.trim() });
      if (result.success) {
        setTitle("");
        setBody("");
        setMessage("お知らせを作成しました");
        router.refresh();
      } else {
        setMessage(result.error ?? "作成に失敗しました");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">タイトル</label>
        <input
          className={inputCls}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">本文</label>
        <textarea
          className={`${inputCls} min-h-40`}
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
        {isPending ? "作成中..." : "お知らせを作成"}
      </button>
    </form>
  );
}
