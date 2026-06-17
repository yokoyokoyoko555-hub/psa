"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateCardStatus } from "@/actions/admin";
import { CardStatus } from "@prisma/client";

const STATUS_OPTIONS: { value: CardStatus; label: string }[] = [
  { value: "SUBMITTED_BY_CUSTOMER", label: "申込済" },
  { value: "RECEIVED_BY_STORE", label: "店舗受取済" },
  { value: "INSPECTION_PENDING", label: "検品待ち" },
  { value: "INSPECTED", label: "検品済" },
  { value: "READY_FOR_PSA", label: "PSA提出準備中" },
  { value: "SUBMITTED_TO_PSA", label: "PSA提出済" },
  { value: "PSA_RECEIVED", label: "PSA受付済" },
  { value: "GRADING", label: "鑑定中" },
  { value: "GRADE_AVAILABLE", label: "グレード確定" },
  { value: "RETURNED_TO_STORE", label: "店舗返却済" },
  { value: "READY_FOR_CUSTOMER_RETURN", label: "返却準備中" },
  { value: "RETURNED_TO_CUSTOMER", label: "返却完了" },
  { value: "PROBLEM", label: "問題発生" },
  { value: "CANCELLED", label: "キャンセル" },
];

export default function CardStatusForm({
  cardId,
  currentStatus,
}: {
  cardId: string;
  currentStatus: CardStatus;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<CardStatus>(currentStatus);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await updateCardStatus(cardId, status, note || undefined);
    router.refresh();
    setNote("");
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value as CardStatus)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="備考（任意）"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="submit"
        disabled={loading || status === currentStatus}
        className="w-full bg-blue-600 text-white font-bold py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition text-sm"
      >
        {loading ? "更新中..." : "ステータスを更新"}
      </button>
    </form>
  );
}
