"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ListingDurationOption } from "@prisma/client";
import { requestPurchase } from "@/actions/purchase";

/** eBay買取の申請フォーム（希望開始価格・出品期間の選択）。ADR-0087 */
export default function PurchaseRequestForm({
  cardId,
  durationOptions,
}: {
  cardId: string;
  durationOptions: ListingDurationOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [desiredPriceUsd, setDesiredPriceUsd] = useState("");
  const [durationOptionId, setDurationOptionId] = useState(durationOptions[0]?.id ?? "");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function submit() {
    setError("");
    startTransition(async () => {
      const res = await requestPurchase({
        cardId,
        customerDesiredPriceUsdMinor: Math.round((parseFloat(desiredPriceUsd) || 0) * 100),
        listingDurationOptionId: durationOptionId,
      });
      if (res.success) {
        setSubmitted(true);
        router.refresh();
      } else {
        setError(res.error ?? "申請に失敗しました");
      }
    });
  }

  if (submitted) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <p className="text-sm text-gray-700">申請を受け付けました。当社での条件確認後、出品条件をご案内します。</p>
      </div>
    );
  }

  if (durationOptions.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <p className="text-sm text-gray-500">現在、買取の受付を一時停止しています。</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <h2 className="font-bold text-gray-900">eBay買取を申し込む</h2>
      <p className="text-xs text-gray-500">
        当社がeBayオークションに出品し、落札が成立して代金決済が完了した時点で、手数料等を差し引いた金額で当社が買い取ります。落札に至らなかった場合、所有権は移転しません。
      </p>
      <div>
        <label className="block text-sm text-gray-700 mb-1">希望開始価格（USD）</label>
        <input
          type="number"
          min={0}
          step="0.01"
          value={desiredPriceUsd}
          onChange={(e) => setDesiredPriceUsd(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="例: 150.00"
        />
      </div>
      <div>
        <label className="block text-sm text-gray-700 mb-1">出品期間</label>
        <div className="space-y-2">
          {durationOptions.map((o) => (
            <label key={o.id} className="flex items-center gap-2 text-sm border border-gray-200 rounded-lg px-3 py-2 cursor-pointer">
              <input
                type="radio"
                name="duration"
                checked={durationOptionId === o.id}
                onChange={() => setDurationOptionId(o.id)}
              />
              <span className="font-medium text-gray-900">{o.label}</span>
              <span className="text-gray-500">（{o.days}日間）</span>
            </label>
          ))}
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={isPending || !desiredPriceUsd}
        className="w-full bg-brand-600 text-white font-bold py-2.5 rounded-lg hover:bg-brand-700 disabled:opacity-50"
      >
        {isPending ? "送信中..." : "この内容で申し込む"}
      </button>
    </div>
  );
}
