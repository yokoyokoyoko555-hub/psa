"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveNotificationEmails } from "@/actions/store-settings";

/** 新規問い合わせ・顧客からの返信をスタッフへ通知するメールアドレス一覧（複数可・1行1件）。 */
export default function NotificationEmailsForm({ emails }: { emails: string[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [text, setText] = useState(emails.join("\n"));
  const [message, setMessage] = useState("");

  function save() {
    setMessage("");
    const list = text
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s !== "");
    startTransition(async () => {
      const res = await saveNotificationEmails({ emails: list });
      setMessage(res.success ? "保存しました" : res.error ?? "保存に失敗しました");
      if (res.success) router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        お問い合わせの受付・顧客からの返信があった際に通知するメールアドレスです。1行に1件入力してください（未入力なら通知しません）。
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder={"例:\nstaff1@turupurun.com\nstaff2@turupurun.com"}
        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900 font-mono"
      />
      <div className="flex items-center justify-end gap-3">
        {message && <span className="text-green-700 text-sm">{message}</span>}
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="bg-brand-600 text-white font-bold px-6 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50 text-sm"
        >
          {isPending ? "保存中..." : "保存"}
        </button>
      </div>
    </div>
  );
}
