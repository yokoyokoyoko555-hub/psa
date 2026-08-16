"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reviewPurchaseAgreement } from "@/actions/purchase";

/** ADMIN/STAFFによる買取申請の条件提示（開始価格・予約価格）。ADR-0087 */
export default function ReviewAgreementForm({
  agreementId,
  customerDesiredPriceUsdMinor,
}: {
  agreementId: string;
  customerDesiredPriceUsdMinor: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [startingPrice, setStartingPrice] = useState((customerDesiredPriceUsdMinor / 100).toString());
  const [reservePrice, setReservePrice] = useState("");
  const [error, setError] = useState("");

  function submit() {
    setError("");
    startTransition(async () => {
      const res = await reviewPurchaseAgreement({
        agreementId,
        startingPriceUsdMinor: Math.round((parseFloat(startingPrice) || 0) * 100),
        reservePriceUsdMinor: reservePrice === "" ? null : Math.round(parseFloat(reservePrice) * 100),
      });
      if (res.success) {
        router.refresh();
      } else {
        setError(res.error ?? "更新に失敗しました");
      }
    });
  }

  return (
    <div className="mt-3 border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">開始価格（USD）</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={startingPrice}
            onChange={(e) => setStartingPrice(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">予約価格（USD・任意）</label>
          <input
            type="number"
            min={0}
            step="0.01"
            placeholder="リザーブなし"
            value={reservePrice}
            onChange={(e) => setReservePrice(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={isPending}
        className="bg-brand-600 text-white text-xs font-bold px-4 py-1.5 rounded hover:bg-brand-700 disabled:opacity-50"
      >
        {isPending ? "送信中..." : "この条件で顧客に提示"}
      </button>
    </div>
  );
}
