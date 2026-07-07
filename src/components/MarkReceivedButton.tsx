"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { markApplicationReceived } from "@/actions/admin";

/** 申込詳細ページで押す「受取完了」ボタン。実物を受け取った際にスタッフが押す。ADR-0034 */
export default function MarkReceivedButton({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (!confirm("受取完了として記録します。よろしいですか？")) return;
    setLoading(true);
    await markApplicationReceived(applicationId);
    router.refresh();
    setLoading(false);
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="bg-brand-600 text-white font-bold px-4 py-2 rounded-lg text-sm hover:bg-brand-700 disabled:opacity-50 transition"
    >
      {loading ? "記録中..." : "受取完了にする"}
    </button>
  );
}
