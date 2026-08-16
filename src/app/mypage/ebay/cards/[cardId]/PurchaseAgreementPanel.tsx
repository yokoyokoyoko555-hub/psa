"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PurchaseAgreement, ListingDurationOption } from "@prisma/client";
import { agreePurchaseAgreement } from "@/actions/purchase";
import { PURCHASE_TERMS_TEXT } from "@/lib/purchase-terms";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "下書き",
  UNDER_REVIEW: "審査中",
  AWAITING_CUSTOMER_AGREEMENT: "同意待ち",
  ACTIVE: "出品中",
  PRICE_REVISION_PENDING: "価格変更申請中",
  PURCHASE_TRIGGERED: "落札成立（買取手続き中）",
  PURCHASE_COMPLETED: "買取成立",
  UNSOLD_AWAITING_CUSTOMER_CHOICE: "売れ残り（返却/再出品の選択待ち）",
  RELISTED: "再出品済み",
  RETURN_REQUESTED: "返却手続き中",
  SUSPENDED: "一時停止中",
};

type AgreementWithDuration = PurchaseAgreement & { listingDurationOption: ListingDurationOption | null };

/** 進行中の買取契約の状態表示・電子同意UI。ADR-0087 */
export default function PurchaseAgreementPanel({ agreement }: { agreement: AgreementWithDuration }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showTerms, setShowTerms] = useState(false);
  const [error, setError] = useState("");

  function agree() {
    setError("");
    startTransition(async () => {
      const res = await agreePurchaseAgreement(agreement.id);
      if (res.success) {
        router.refresh();
      } else {
        setError(res.error ?? "同意処理に失敗しました");
      }
    });
  }

  if (agreement.status === "AWAITING_CUSTOMER_AGREEMENT") {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="font-bold text-gray-900">出品条件のご確認</h2>
        <dl className="text-sm space-y-2">
          <div className="flex justify-between">
            <dt className="text-gray-500">開始価格</dt>
            <dd className="font-bold">${((agreement.startingPriceUsdMinor ?? 0) / 100).toFixed(2)}</dd>
          </div>
          {agreement.reservePriceUsdMinor != null && (
            <div className="flex justify-between">
              <dt className="text-gray-500">予約価格（リザーブ）</dt>
              <dd className="font-bold">${(agreement.reservePriceUsdMinor / 100).toFixed(2)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-gray-500">出品期間</dt>
            <dd className="font-bold">
              {agreement.listingDurationOption ? `${agreement.listingDurationOption.label}（${agreement.listingDurationOption.days}日間）` : "—"}
            </dd>
          </div>
        </dl>
        <div>
          <button
            type="button"
            onClick={() => setShowTerms((s) => !s)}
            className="text-sm text-brand-600 hover:underline"
          >
            {showTerms ? "契約内容を閉じる" : "契約内容を確認する"}
          </button>
          {showTerms && (
            <pre className="mt-2 whitespace-pre-wrap text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-80 overflow-y-auto">
              {PURCHASE_TERMS_TEXT}
            </pre>
          )}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="button"
          onClick={agree}
          disabled={isPending}
          className="w-full bg-brand-600 text-white font-bold py-2.5 rounded-lg hover:bg-brand-700 disabled:opacity-50"
        >
          {isPending ? "処理中..." : "内容に同意して出品を申し込む"}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-900">買取契約 {agreement.agreementNo}</h2>
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-brand-100 text-brand-700">
          {STATUS_LABELS[agreement.status] ?? agreement.status}
        </span>
      </div>
      <dl className="text-sm space-y-2">
        {agreement.startingPriceUsdMinor != null && (
          <div className="flex justify-between">
            <dt className="text-gray-500">開始価格</dt>
            <dd className="font-bold">${(agreement.startingPriceUsdMinor / 100).toFixed(2)}</dd>
          </div>
        )}
        {agreement.listingExpiresAt && (
          <div className="flex justify-between">
            <dt className="text-gray-500">出品期限</dt>
            <dd className="font-bold">{new Date(agreement.listingExpiresAt).toLocaleDateString("ja-JP")}</dd>
          </div>
        )}
      </dl>
      {agreement.status === "UNDER_REVIEW" && (
        <p className="text-xs text-gray-500">当社での確認をお待ちください。</p>
      )}
    </div>
  );
}
