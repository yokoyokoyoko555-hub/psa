"use client";

export type StripeCardElementLike = {
  mount: (selector: string | HTMLElement) => void;
  destroy: () => void;
  on: (event: "change", handler: (event: { error?: { message?: string } }) => void) => void;
};

export type StripeElementsLike = {
  create: (
    type: "card",
    options?: {
      style?: Record<string, Record<string, string | Record<string, string>>>;
      hidePostalCode?: boolean;
    }
  ) => StripeCardElementLike;
};

export type StripeClientLike = {
  elements: (options?: { clientSecret?: string }) => StripeElementsLike;
  confirmCardPayment: (
    secret: string,
    opts?: { payment_method: { card: StripeCardElementLike; billing_details?: { name?: string } } }
  ) => Promise<{
    error?: { message?: string };
    paymentIntent?: { id: string; status: string };
  }>;
};

type WindowWithStripe = Window & { Stripe?: (key: string) => StripeClientLike };

function hasStripe(): boolean {
  return typeof (window as WindowWithStripe).Stripe === "function";
}

let loadingPromise: Promise<void> | null = null;

function loadStripeScript(): Promise<void> {
  if (hasStripe()) return Promise.resolve();
  if (loadingPromise) return loadingPromise;
  loadingPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://js.stripe.com/v3/"]');
    if (existing) {
      const wait = window.setInterval(() => {
        if (hasStripe()) {
          window.clearInterval(wait);
          resolve();
        }
      }, 50);
      window.setTimeout(() => {
        window.clearInterval(wait);
        if (hasStripe()) resolve();
        else reject(new Error("Stripe.js の読み込みに失敗しました"));
      }, 5000);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://js.stripe.com/v3/";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Stripe.js の読み込みに失敗しました"));
    document.head.appendChild(script);
  });
  return loadingPromise;
}

/**
 * Stripe.jsを遅延ロードしてクライアントを返す共通ユーティリティ。
 * 各決済コンポーネントが個別にスクリプト読み込みを実装すると「読み込み忘れ」のバグを
 * 繰り返しやすいため、ここに一本化する。ADR-0048
 */
export async function getStripeClient(publishableKey: string): Promise<StripeClientLike> {
  await loadStripeScript();
  const stripeFn = (window as WindowWithStripe).Stripe;
  if (!stripeFn) throw new Error("Stripe.js の読み込みに失敗しました");
  return stripeFn(publishableKey);
}
