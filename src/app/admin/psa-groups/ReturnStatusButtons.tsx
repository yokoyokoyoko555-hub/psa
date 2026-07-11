"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markGroupReturnPreparing, markGroupReturned } from "@/actions/admin";

/**
 * PSA提出グループを一括で「返送準備中」「返送完了」に進めるボタン。
 * カード単位のステータスは持たない。グループ単位の一括操作のみ。ADR-0065/0066
 */
export default function ReturnStatusButtons({
  groupId,
  returnReady,
  returned,
}: {
  groupId: string;
  returnReady: boolean;
  returned: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handlePreparing() {
    if (!confirm("グループ内の全申込を「④受取可能/返送準備中」にします。よろしいですか？")) return;
    setError("");
    startTransition(async () => {
      const res = await markGroupReturnPreparing(groupId);
      if (res.success) router.refresh();
      else setError(res.error ?? "更新に失敗しました");
    });
  }

  function handleReturned() {
    if (!confirm("グループ内の全申込を「⑤受取完了/返送完了」にします。よろしいですか？")) return;
    setError("");
    startTransition(async () => {
      const res = await markGroupReturned(groupId);
      if (res.success) router.refresh();
      else setError(res.error ?? "更新に失敗しました");
    });
  }

  if (returned) {
    return <p className="text-xs text-green-700 font-medium">全申込が受取完了/返送完了です。</p>;
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handlePreparing}
        disabled={isPending || returnReady}
        className="border border-teal-300 text-teal-700 font-bold px-4 py-1.5 rounded-lg text-sm hover:bg-teal-50 disabled:opacity-50 transition"
      >
        {isPending ? "更新中..." : "④受取可能/返送準備中にする"}
      </button>
      <button
        onClick={handleReturned}
        disabled={isPending || !returnReady}
        title={!returnReady ? "先に④受取可能/返送準備中にしてください" : undefined}
        className="bg-brand-600 text-white font-bold px-4 py-1.5 rounded-lg text-sm hover:bg-brand-700 disabled:opacity-50 transition"
      >
        {isPending ? "更新中..." : "⑤受取完了/返送完了にする"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
