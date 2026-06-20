"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createNotification, updateNotification } from "@/actions/notification";

const inputCls =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500";

export default function NotificationForm({
  initial,
}: {
  initial?: {
    id: string;
    title: string;
    body: string;
    showOnMypage: boolean;
    isPublished: boolean;
  };
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [showOnMypage, setShowOnMypage] = useState(initial?.showOnMypage ?? true);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const isEdit = Boolean(initial);

  function save(isPublished: boolean) {
    setMessage("");
    startTransition(async () => {
      const payload = {
        id: initial?.id,
        title: title.trim(),
        body: body.trim(),
        showOnMypage,
        isPublished,
      };
      const result = isEdit ? await updateNotification(payload) : await createNotification(payload);
      if (result.success) {
        if (!isEdit) {
          setTitle("");
          setBody("");
          setShowOnMypage(true);
        }
        setMessage(isPublished ? "お知らせを公開しました" : "お知らせを一時保存しました");
        router.refresh();
      } else {
        setMessage(result.error ?? "保存に失敗しました");
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(true);
      }}
      className="space-y-4"
    >
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
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={showOnMypage}
          onChange={(e) => setShowOnMypage(e.target.checked)}
          className="h-4 w-4"
        />
        マイページに表示する
      </label>
      {message && <p className="text-sm text-gray-600">{message}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => save(false)}
          className="border border-gray-300 text-gray-700 font-bold px-5 py-2.5 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
        >
          {isPending ? "保存中..." : "一時保存"}
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="bg-brand-600 text-white font-bold px-5 py-2.5 rounded-lg hover:bg-brand-700 transition disabled:opacity-50"
        >
          {isPending ? "保存中..." : isEdit ? "公開して更新" : "公開する"}
        </button>
      </div>
    </form>
  );
}
