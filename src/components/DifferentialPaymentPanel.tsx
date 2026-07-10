"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createDifferentialPaymentIntent, confirmDifferentialPayment } from "@/actions/payment";
import { formatMoneyIn } from "@/lib/currency";
import { getStripeClient } from "@/lib/stripe-client";
import StripeCardPayment from "./StripeCardPayment";

/**
 * 代理申込の確定分請求（PENDING）を、顧客が能動的に確認・支払うためのパネル。
 * 保存済みのデフォルトカードがあればワンクリック決済、無ければ（または別のカードを
 * 使いたい場合は）StripeCardPaymentでカード入力。自動課金は行わない（ADR-0042/0048）。
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
  const [intent, setIntent] = useState<{
    clientSecret: string;
    savedCard: { brand: string; last4: string } | null;
  } | null>(null);

  async function handleStart(useSavedCard: boolean) {
    setError("");
    setLoading(true);
    const result = await createDifferentialPaymentIntent(applicationId, useSavedCard);
    setLoading(false);
    if (!result.success) {
      setError(result.error ?? "決済準備に失敗しました");
      return;
    }
    setIntent({ clientSecret: result.clientSecret, savedCard: result.savedCard });
  }

  async function handleConfirmed(paymentIntentId: string) {
    setError("");
    const result = await confirmDifferentialPayment({ applicationId, paymentIntentId });
    if (!result.success) {
      setError(result.error ?? "決済は完了しましたが、反映に時間がかかっています。時間をおいて再度ご確認ください。");
      return;
    }
    setPaid(true);
    router.refresh();
  }

  async function handlePaySavedCard() {
    if (!intent) return;
    setError("");
    setLoading(true);
    try {
      const stripe = await getStripeClient(publishableKey);
      const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(intent.clientSecret);
      if (stripeError) {
        setError(stripeError.message ?? "決済エラーが発生しました");
        return;
      }
      const paymentIntentId = paymentIntent?.id ?? intent.clientSecret.split("_secret_")[0];
      await handleConfirmed(paymentIntentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "決済処理中にエラーが発生しました");
    } finally {
      setLoading(false);
    }
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

      {!intent ? (
        <button
          type="button"
          onClick={() => handleStart(true)}
          disabled={loading}
          className="w-full bg-brand-600 text-white font-bold py-3 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition"
        >
          {loading ? "準備中..." : "内容を確認してお支払いへ進む"}
        </button>
      ) : intent.savedCard ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            登録済みのカード（{intent.savedCard.brand} •••• {intent.savedCard.last4}）でお支払いします。
          </p>
          <button
            type="button"
            onClick={handlePaySavedCard}
            disabled={loading}
            className="w-full bg-brand-600 text-white font-bold py-3 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition"
          >
            {loading ? "決済処理中..." : `${formatMoneyIn(amount, "JPY")} を支払う`}
          </button>
          <button
            type="button"
            onClick={() => handleStart(false)}
            disabled={loading}
            className="w-full text-sm text-gray-500 hover:text-gray-700"
          >
            別のカードを使う
          </button>
        </div>
      ) : (
        <StripeCardPayment
          clientSecret={intent.clientSecret}
          publishableKey={publishableKey}
          buttonLabel={`${formatMoneyIn(amount, "JPY")} を支払う`}
          onPaid={handleConfirmed}
          onError={setError}
        />
      )}
    </div>
  );
}
