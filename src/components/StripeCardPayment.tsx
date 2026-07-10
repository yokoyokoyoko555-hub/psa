"use client";

import { useState, useEffect, useRef } from "react";
import { getStripeClient, type StripeClientLike, type StripeCardElementLike } from "@/lib/stripe-client";

type Props = {
  clientSecret: string;
  publishableKey: string;
  /** 決済ボタンのラベル（例「¥3,300 を支払う」） */
  buttonLabel: string;
  /** Stripe billing_details.name */
  billingName?: string;
  /** 決済成功時に paymentIntentId を返す。呼び出し側でサーバー確定を行う */
  onPaid: (paymentIntentId: string) => Promise<void> | void;
  /** 決済/読込エラー時の通知 */
  onError?: (message: string) => void;
};

/**
 * Stripe.js を遅延ロードしカード Element をマウント、confirmCardPayment まで行う再利用コンポーネント。
 * ApplyForm の決済ロジックを切り出したもの（ADR-0020 の代理入力先払いで再利用）。
 * Stripe.jsの読み込み自体は lib/stripe-client.ts の共通ユーティリティを使う。ADR-0048
 */
export default function StripeCardPayment({
  clientSecret,
  publishableKey,
  buttonLabel,
  billingName,
  onPaid,
  onError,
}: Props) {
  const [stripeReady, setStripeReady] = useState(false);
  const [cardError, setCardError] = useState("");
  const [paying, setPaying] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stripeRef = useRef<StripeClientLike | null>(null);
  const cardRef = useRef<StripeCardElementLike | null>(null);

  useEffect(() => {
    if (!clientSecret || !containerRef.current) return;
    let cancelled = false;

    async function setup() {
      const stripe = await getStripeClient(publishableKey);
      if (cancelled || !containerRef.current) return;

      cardRef.current?.destroy();
      const elements = stripe.elements({ clientSecret });
      const card = elements.create("card", {
        hidePostalCode: true,
        style: {
          base: {
            color: "#111827",
            fontSize: "16px",
            "::placeholder": { color: "#9ca3af" },
          },
          invalid: { color: "#b91c1c" },
        },
      });
      card.on("change", (event) => setCardError(event.error?.message ?? ""));
      card.mount(containerRef.current);
      stripeRef.current = stripe;
      cardRef.current = card;
      setStripeReady(true);
    }

    setStripeReady(false);
    setCardError("");
    setup().catch((err: unknown) => {
      onError?.(err instanceof Error ? err.message : "Stripe.js の読み込みに失敗しました");
    });

    return () => {
      cancelled = true;
    };
    // onError は親の再生成で再実行したくないため依存に含めない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientSecret, publishableKey]);

  async function handlePay() {
    if (!clientSecret || !stripeRef.current || !cardRef.current) {
      onError?.("カード入力欄の読み込みが完了していません");
      return;
    }
    setPaying(true);
    try {
      const { error: stripeError, paymentIntent } = await stripeRef.current.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardRef.current,
          billing_details: { name: billingName ?? "Customer" },
        },
      });
      if (stripeError) {
        onError?.(stripeError.message ?? "決済エラーが発生しました");
        return;
      }
      const paymentIntentId = paymentIntent?.id ?? clientSecret.split("_secret_")[0];
      if (!paymentIntentId) {
        onError?.("決済は完了しましたが、確認に失敗しました。時間をおいて再度お試しください。");
        return;
      }
      await onPaid(paymentIntentId);
    } catch (err) {
      console.error(err);
      onError?.("決済処理中にエラーが発生しました。時間をおいて再度お試しください。");
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-300 bg-white px-3 py-3 focus-within:ring-2 focus-within:ring-brand-500">
        <div ref={containerRef} className="min-h-6" />
      </div>
      {cardError && <p className="text-sm text-red-600">{cardError}</p>}
      {!stripeReady && <p className="text-sm text-brand-700">カード入力欄を読み込んでいます...</p>}
      <button
        onClick={handlePay}
        disabled={paying || !stripeReady || !!cardError}
        className="w-full bg-brand-600 text-white font-bold py-3 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition"
      >
        {paying ? "決済処理中..." : buttonLabel}
      </button>
      <p className="text-xs text-gray-400 text-center">
        カード情報はStripe上で安全に処理され、このサービスには保存されません。
      </p>
    </div>
  );
}
