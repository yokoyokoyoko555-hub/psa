import { prisma } from "./prisma";

const EXCHANGE_RATE_ID = "default";
const FRANKFURTER_URL = "https://api.frankfurter.dev/v1/latest?from=USD&to=JPY";

/** ECB（欧州中央銀行）データを無料公開しているFrankfurter APIからUSD/JPYレートを取得。APIキー不要。 */
export async function fetchUsdJpyRateFromApi(): Promise<number> {
  const res = await fetch(FRANKFURTER_URL);
  if (!res.ok) {
    throw new Error(`Frankfurter API error (${res.status})`);
  }
  const data = (await res.json()) as { rates?: { JPY?: number } };
  const rate = data.rates?.JPY;
  if (typeof rate !== "number" || !(rate > 0)) {
    throw new Error("Frankfurter API returned an invalid rate");
  }
  return rate;
}

/**
 * 為替レートの自動更新。1日1回まで（既に当日分を試行済みならスキップ）。
 * 決済に直結する値のため、min/maxの安全弁を外れた取得値は反映せずlastAutoFetchErrorに記録するのみ。
 */
export async function runAutoExchangeRateUpdateIfDue(): Promise<void> {
  const current = await prisma.exchangeRate.findUnique({ where: { id: EXCHANGE_RATE_ID } });
  if (!current?.autoUpdate) return;

  const today = new Date().toISOString().slice(0, 10);
  const lastFetchDay = current.lastAutoFetchAt?.toISOString().slice(0, 10);
  if (lastFetchDay === today) return;

  try {
    const rate = await fetchUsdJpyRateFromApi();
    const belowMin = current.minRate != null && rate < current.minRate;
    const aboveMax = current.maxRate != null && rate > current.maxRate;

    if (belowMin || aboveMax) {
      await prisma.exchangeRate.update({
        where: { id: EXCHANGE_RATE_ID },
        data: {
          lastAutoFetchAt: new Date(),
          lastAutoFetchError: `取得値 ${rate} が設定範囲（${current.minRate ?? "下限なし"}〜${current.maxRate ?? "上限なし"}）外のため更新を見送りました`,
        },
      });
      console.error(`[exchange-rate] auto-update skipped: rate ${rate} out of bounds`);
      return;
    }

    await prisma.exchangeRate.update({
      where: { id: EXCHANGE_RATE_ID },
      data: { usdJpyRate: rate, lastAutoFetchAt: new Date(), lastAutoFetchError: null },
    });
    console.log(`[exchange-rate] auto-updated to ${rate}`);
  } catch (err) {
    await prisma.exchangeRate.update({
      where: { id: EXCHANGE_RATE_ID },
      data: { lastAutoFetchAt: new Date(), lastAutoFetchError: err instanceof Error ? err.message : String(err) },
    });
    console.error("[exchange-rate] auto-update failed:", err);
  }
}
