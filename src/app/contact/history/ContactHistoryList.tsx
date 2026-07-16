"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { replyToInquiryAsCustomer, resolveInquiryAsCustomer } from "@/actions/inquiry";
import { format } from "date-fns";
import { ja } from "date-fns/locale";

type InquiryMessage = {
  id: string;
  sender: "CUSTOMER" | "STAFF";
  body: string;
  createdAt: Date;
};

type InquiryItem = {
  id: string;
  subject: string;
  body: string;
  status: string;
  replyText: string | null;
  repliedAt: Date | null;
  resolved: boolean;
  createdAt: Date;
  messages: InquiryMessage[];
};

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  UNREAD: { label: "確認中", className: "bg-yellow-100 text-yellow-700" },
  READ: { label: "確認中", className: "bg-yellow-100 text-yellow-700" },
  REPLIED: { label: "回答済み", className: "bg-green-100 text-green-700" },
};
const RESOLVED_STATUS = { label: "完了", className: "bg-gray-100 text-gray-600" };

export default function ContactHistoryList({ inquiries }: { inquiries: InquiryItem[] }) {
  if (inquiries.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400 text-sm">
        お問い合わせの履歴はありません
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {inquiries.map((inq) => (
        <ContactHistoryItem key={inq.id} inquiry={inq} />
      ))}
    </div>
  );
}

function ContactHistoryItem({ inquiry }: { inquiry: InquiryItem }) {
  const router = useRouter();
  const [replyBody, setReplyBody] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const status = inquiry.resolved
    ? RESOLVED_STATUS
    : STATUS_LABELS[inquiry.status] ?? { label: inquiry.status, className: "bg-gray-100 text-gray-600" };
  const messages = buildMessages(inquiry);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    startTransition(async () => {
      const result = await replyToInquiryAsCustomer({ id: inquiry.id, body: replyBody.trim() });
      if (result.success) {
        setReplyBody("");
        setMessage("返信を送信しました");
        router.refresh();
      } else {
        setMessage(result.error ?? "返信に失敗しました");
      }
    });
  }

  function handleResolve() {
    setMessage("");
    startTransition(async () => {
      const result = await resolveInquiryAsCustomer(inquiry.id);
      if (result.success) {
        router.refresh();
      } else {
        setMessage(result.error ?? "終了に失敗しました");
      }
    });
  }

  return (
    <details className="group bg-white rounded-xl border border-gray-200 overflow-hidden">
      <summary className="list-none cursor-pointer p-5 flex items-center gap-4 hover:bg-gray-50 transition">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-gray-900 truncate">{inquiry.subject}</p>
          <p className="text-xs text-gray-400 mt-1">
            {format(new Date(inquiry.createdAt), "yyyy年M月d日 HH:mm", { locale: ja })}
          </p>
        </div>
        <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${status.className}`}>
          {status.label}
        </span>
        <span className="text-brand-600 text-sm transition group-open:rotate-90">›</span>
      </summary>

      <div className="border-t border-gray-100 p-5 space-y-4">
        <div className="space-y-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`rounded-lg border p-3 ${
                msg.sender === "STAFF"
                  ? "bg-brand-50 border-brand-100"
                  : "bg-gray-50 border-gray-200"
              }`}
            >
              <p className={`text-xs font-bold mb-1 ${msg.sender === "STAFF" ? "text-brand-700" : "text-gray-500"}`}>
                {msg.sender === "STAFF" ? "回答" : "お問い合わせ"}
                <span className="font-normal ml-1">
                  {format(new Date(msg.createdAt), "yyyy年M月d日 HH:mm", { locale: ja })}
                </span>
              </p>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{msg.body}</p>
            </div>
          ))}
        </div>

        {inquiry.resolved ? (
          <p className="text-sm text-gray-400 border-t border-gray-100 pt-4">このお問い合わせは終了しました</p>
        ) : (
          <div className="space-y-4">
            {inquiry.replyText && (
              <form onSubmit={handleSubmit} className="space-y-2">
                <label className="block text-xs font-medium text-gray-600">この回答へ返信する</label>
                <textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  maxLength={4000}
                  className="w-full min-h-28 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="返信内容を入力してください"
                />
                <button
                  type="submit"
                  disabled={isPending || !replyBody.trim()}
                  className="bg-brand-600 text-white font-bold px-5 py-2.5 rounded-lg hover:bg-brand-700 transition disabled:opacity-50"
                >
                  {isPending ? "送信中..." : "返信する"}
                </button>
              </form>
            )}
            {message && <p className="text-sm text-gray-600">{message}</p>}
            <button
              type="button"
              onClick={handleResolve}
              disabled={isPending}
              className="text-sm text-gray-500 hover:text-gray-700 underline disabled:opacity-50"
            >
              解決したのでこの問い合わせを終了する
            </button>
          </div>
        )}
      </div>
    </details>
  );
}

function buildMessages(inquiry: InquiryItem): InquiryMessage[] {
  if (inquiry.messages.length > 0) return inquiry.messages;

  const messages: InquiryMessage[] = [
    {
      id: `${inquiry.id}-body`,
      sender: "CUSTOMER",
      body: inquiry.body,
      createdAt: inquiry.createdAt,
    },
  ];

  if (inquiry.replyText) {
    messages.push({
      id: `${inquiry.id}-reply`,
      sender: "STAFF",
      body: inquiry.replyText,
      createdAt: inquiry.repliedAt ?? inquiry.createdAt,
    });
  }

  return messages;
}
