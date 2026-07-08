"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createDifferentialPaymentIntent, confirmDifferentialPayment } from "@/actions/payment";
import { formatMoneyIn } from "@/lib/currency";
import StripeCardPayment from "./StripeCardPayment";

/**
 * 代理申込の確定分請求（PENDING）を、顧客が能動的に確認・支払うためのパネル。
 * 保存済みカードの使い回しはせず、都度StripeCardPaymentでカード情報を入力してもらう。ADR-0046
 */
export default function DifferentialPaymentPanel({
  applicationId,
  amount,
  publishableKey,
}: {
  applicationId: string;
  amount: number;
  publishableKey: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [paid, setPaid] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  async function handleStart() {
    setError("");
    setLoading(true);
    const result = await createDifferentialPaymentIntent(applicationId);
    setLoading(false);
    if (!result.success) {
      setError(result.error ?? "決済準備に失敗しました");
      return;
    }
    setClientSecret(result.clientSecret);
  }

  async function handlePaid(paymentIntentId: string) {
    setError("");
    const result = await confirmDifferentialPayment({ applicationId, paymentIntentId });
    if (!result.success) {
      setError(result.error ?? "決済は完了しましたが、反映に時間がかかっています。時間をおいて再度ご確認ください。");
      return;
    }
    setPaid(true);
    router.refresh();
  }

  if (paid) {
    return (
      <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-4 text-sm">
        ✓ お支払いが完了しました。
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-amber-300 p-6">
      <h2 className="font-bold text-gray-900 mb-1">お支払いのお願い</h2>
      <p className="text-sm text-gray-600 mb-4">
        カード内容の確定に伴い、以下の金額のお支払いが必要です。内容をご確認のうえお支払いください。
      </p>
      <p className="text-2xl font-bold text-gray-900 mb-4">{formatMoneyIn(amount, "JPY")}</p>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm mb-4">{error}</div>}

      {!clientSecret ? (
        <button
          type="button"
          onClick={handleStart}
          disabled={loading}
          className="w-full bg-brand-600 text-white font-bold py-3 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition"
        >
          {loading ? "準備中..." : "内容を確認してお支払いへ進む"}
        </button>
      ) : (
        <StripeCardPayment
          clientSecret={clientSecret}
          publishableKey={publishableKey}
          buttonLabel={`${formatMoneyIn(amount, "JPY")} を支払う`}
          onPaid={handlePaid}
          onError={setError}
        />
      )}
    </div>
  );
}
