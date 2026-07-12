"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCenteringToolEnabled } from "@/actions/store-settings";

/** センタリング測定ツールを顧客画面（マイページ）に表示するかどうかのON/OFFスイッチ。ADR-0070 */
export default function CenteringToggleForm({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleToggle() {
    setError("");
    startTransition(async () => {
      const result = await setCenteringToolEnabled(!enabled);
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error ?? "更新に失敗しました");
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-gray-900">センタリング測定ツールを顧客画面に表示する</p>
          <p className="text-xs text-gray-500 mt-1">
            OFFにすると、マイページの導線と測定ページを顧客から非表示にします（機能・データは削除されません）。
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={handleToggle}
          disabled={isPending}
          className={`shrink-0 relative w-12 h-7 rounded-full transition disabled:opacity-50 ${
            enabled ? "bg-brand-600" : "bg-gray-300"
          }`}
        >
          <span
            className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
