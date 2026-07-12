"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { replyToInquiry } from "@/actions/inquiry";

export default function InquiryReplyForm({
  id,
  initialReplyText,
  initialAllowCustomerReply,
}: {
  id: string;
  initialReplyText: string | null;
  initialAllowCustomerReply: boolean;
}) {
  const router = useRouter();
  const [replyText, setReplyText] = useState("");
  const [allowCustomerReply, setAllowCustomerReply] = useState(initialAllowCustomerReply);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    startTransition(async () => {
      const result = await replyToInquiry({ id, replyText: replyText.trim(), allowCustomerReply });
      if (result.success) {
        setMessage("回答を送信しました");
        router.refresh();
      } else {
        setMessage(result.error ?? "送信に失敗しました");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <textarea
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 min-h-32 focus:outline-none focus:ring-2 focus:ring-brand-500"
        value={replyText}
        onChange={(e) => setReplyText(e.target.value)}
        placeholder="回答内容を入力してください"
      />
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={allowCustomerReply}
          onChange={(e) => setAllowCustomerReply(e.target.checked)}
          className="h-4 w-4"
        />
        顧客からの返信を許可する
      </label>
      {message && <p className="text-sm text-gray-600">{message}</p>}
      <button
        type="submit"
        disabled={isPending || !replyText.trim()}
        className="bg-brand-600 text-white font-bold px-5 py-2.5 rounded-lg hover:bg-brand-700 transition disabled:opacity-50"
      >
        {isPending ? "送信中..." : initialReplyText ? "追加回答を送信する" : "回答を送信する"}
      </button>
    </form>
  );
}
