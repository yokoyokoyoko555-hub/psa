"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveExchangeRate } from "@/actions/pricing";

export default function ExchangeRateForm({
  usdJpyRate,
  marginPercent,
}: {
  usdJpyRate: number;
  marginPercent: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rate, setRate] = useState(String(usdJpyRate));
  const [margin, setMargin] = useState(String(marginPercent));
  const [message, setMessage] = useState("");

  const rateNum = parseFloat(rate) || 0;
  const marginNum = parseFloat(margin) || 0;
  const effectiveRate = rateNum * (1 + marginNum / 100);

  function save() {
    setMessage("");
    startTransition(async () => {
      const res = await saveExchangeRate({
        usdJpyRate: rateNum,
        marginPercent: marginNum,
      });
      setMessage(res.success ? "保存しました" : res.error ?? "保存に失敗しました");
      if (res.success) router.refresh();
    });
  }

  const inputCls = "w-32 border border-gray-300 rounded px-2 py-1 text-sm text-gray-900";

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        PSA USの鑑定料等（USD建て）を、決済時にJPYへ換算するためのレートです。
        実効レート = 実勢レート ×（1 + マージン%）。決済は常にこの実効レートでJPY換算して行われます。
      </p>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-28 text-sm text-gray-700">実勢レート</span>
          <input type="number" min={0} step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} className={inputCls} />
          <span className="text-sm text-gray-600">円 / $1</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-28 text-sm text-gray-700">マージン</span>
          <input type="number" min={0} step="0.1" value={margin} onChange={(e) => setMargin(e.target.value)} className={inputCls} />
          <span className="text-sm text-gray-600">%</span>
        </div>
        <p className="text-sm text-gray-700">
          実効レート: <span className="font-bold">$1 = ¥{effectiveRate.toFixed(2)}</span>
        </p>
      </div>
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
