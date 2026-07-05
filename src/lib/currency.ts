// 地域に応じた通貨表示。PSA US は USD($)、それ以外(PSA日本)は 円(¥)。
// JP=円・整数 / US=USD・小数点以下2桁。DB上もこの単位（セント変換はStripe呼び出し時のみ）。ADR-0022 / PRICING.md

export function currencySymbol(region: string | null | undefined): string {
  return region === "PSA_US" ? "$" : "¥";
}

export function formatMoney(amount: number, region: string | null | undefined): string {
  const isUsd = region === "PSA_US";
  const formatted = (amount ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: isUsd ? 2 : 0,
    maximumFractionDigits: isUsd ? 2 : 0,
  });
  return `${currencySymbol(region)}${formatted}`;
}

/** 金額の丸め。JP=円の整数(切り捨て・既存挙動を維持) / US=セント単位で四捨五入。 */
export function roundMoney(amount: number, region: string | null | undefined): number {
  if (region === "PSA_US") return Math.round(amount * 100) / 100;
  return Math.floor(amount);
}

/**
 * 明示通貨での金額表示（regionに依存しない）。円=整数 / USD=小数点以下2桁。
 * 申告上限（ServicePrice/CustomServicePriceのmaxDeclaredValue）など、
 * リージョンに関わらず常に特定の通貨で扱うべき値に使う。ADR-0025
 */
export function formatMoneyIn(amount: number, currency: "JPY" | "USD"): string {
  const isUsd = currency === "USD";
  const formatted = (amount ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: isUsd ? 2 : 0,
    maximumFractionDigits: isUsd ? 2 : 0,
  });
  return `${isUsd ? "$" : "¥"}${formatted}`;
}

/** Stripe API向け最小通貨単位への変換（JPYは無位取りのため整数そのまま / USDはセント）。 */
export function toStripeAmount(amount: number, region: string | null | undefined): number {
  return region === "PSA_US" ? Math.round(amount * 100) : Math.round(amount);
}

export function stripeCurrency(region: string | null | undefined): string {
  return region === "PSA_US" ? "usd" : "jpy";
}
