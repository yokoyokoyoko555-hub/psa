"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { advanceGroupStatus } from "@/actions/admin";

/** 発送完了後のグループに対し、管理画面で登録済みのPSA進捗ステータス名を一括反映する。ADR-0034 */
export default function AdvanceGroupStatusForm({
  groupId,
  currentStatus,
  statusOptions,
}: {
  groupId: string;
  currentStatus: string;
  statusOptions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState(
    statusOptions.find((s) => s.name === currentStatus)?.name ?? statusOptions[0]?.name ?? ""
  );
  const [error, setError] = useState("");

  function handleUpdate() {
    setError("");
    startTransition(async () => {
      const res = await advanceGroupStatus(groupId, selected);
      if (res.success) {
        router.refresh();
      } else {
        setError(res.error ?? "更新に失敗しました");
      }
    });
  }

  if (statusOptions.length === 0) {
    return (
      <p className="text-xs text-gray-400">
        管理画面の設定＞PSA進捗ステータスから、選択肢を登録してください。
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900"
      >
        {statusOptions.map((s) => (
          <option key={s.id} value={s.name}>{s.name}</option>
        ))}
      </select>
      <button
        onClick={handleUpdate}
        disabled={isPending || selected === currentStatus}
        className="bg-brand-600 text-white font-bold px-4 py-1.5 rounded-lg text-sm hover:bg-brand-700 disabled:opacity-50 transition"
      >
        {isPending ? "更新中..." : "ステータスを反映"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
