// 地域に応じた通貨表示。PSA US は USD($)、それ以外(PSA日本)は 円(¥)。
// 金額は整数で保持（USDは小数なし運用）。ADR-0015 / PRICING.md

export function currencySymbol(region: string | null | undefined): string {
  return region === "PSA_US" ? "$" : "¥";
}

export function formatMoney(amount: number, region: string | null | undefined): string {
  return `${currencySymbol(region)}${(amount ?? 0).toLocaleString()}`;
}
