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
 * 代理入力料金・事務手数料・送料保険料など、リージョンに関わらず常に円で扱うべき値に使う。ADR-0025
 */
export function formatMoneyIn(amount: number, currency: "JPY" | "USD"): string {
  const isUsd = currency === "USD";
  const formatted = (amount ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: isUsd ? 2 : 0,
    maximumFractionDigits: isUsd ? 2 : 0,
  });
  return `${isUsd ? "$" : "¥"}${formatted}`;
}

/**
 * 申告金額・申告上限（Card.declaredValue / CustomServicePrice.maxDeclaredValue）専用の表示。
 * リージョン通貨（PSA_US=$ / PSA_JP=¥）だが、小数点以下は常に非表示（整数）。ADR-0027
 */
export function formatMoneyInt(amount: number, region: string | null | undefined): string {
  const formatted = Math.round(amount ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
  return `${currencySymbol(region)}${formatted}`;
}

/**
 * Stripe API向け最小通貨単位への変換。決済は常にJPY（無位取り）で行う。
 * PSA USも鑑定料等をJPYへ換算してから合算するため、リージョンに関わらず円決済になる。ADR-0031
 */
export function toStripeAmount(amount: number): number {
  return Math.round(amount);
}

export function stripeCurrency(): string {
  return "jpy";
}

/**
 * USD→JPYの実効為替レート（実勢レート×(1+マージン%)）を計算する。
 * PSA USの鑑定料等（USD建て）を決済用にJPYへ換算する際に使う。ADR-0031
 */
export function effectiveUsdJpyRate(usdJpyRate: number, marginPercent: number): number {
  return usdJpyRate * (1 + marginPercent / 100);
}
