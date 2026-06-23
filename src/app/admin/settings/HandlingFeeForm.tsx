"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveHandlingFee } from "@/actions/pricing";

export default function HandlingFeeForm({ handlingFee }: { handlingFee: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(String(handlingFee));
  const [message, setMessage] = useState("");

  function save() {
    setMessage("");
    startTransition(async () => {
      const res = await saveHandlingFee(parseInt(value) || 0);
      setMessage(res.success ? "保存しました" : res.error ?? "保存に失敗しました");
      if (res.success) router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        すべてのサービス共通の一律額です。1申込（=1サービスレベル）につき1回加算されます（PSA日本）。
      </p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-32 border border-gray-300 rounded px-2 py-1 text-sm text-gray-900"
        />
        <span className="text-sm text-gray-600">円 / 申込</span>
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="bg-brand-600 text-white font-bold px-6 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50 text-sm"
        >
          {isPending ? "保存中..." : "保存"}
        </button>
        {message && <span className="text-green-700 text-sm">{message}</span>}
      </div>
    </div>
  );
}
