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

/** 為替レート自動取得の失敗・範囲外スキップをスタッフへメール通知（best-effort、再試行はしない）。 */
async function notifyStaffOfExchangeRateFailure(reason: string) {
  if (!process.env.RESEND_API_KEY) return;
  const settings = await prisma.storeSettings.findUnique({ where: { id: "default" } });
  const emails = settings?.notificationEmails ?? [];
  if (emails.length === 0) return;

  const { sendMail, exchangeRateFetchFailedHtml } = await import("./mailer");
  const appUrl = process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "";
  const html = exchangeRateFetchFailedHtml({ reason, appUrl });
  for (const to of emails) {
    try {
      await sendMail({ to, subject: "【トレカビンクス】為替レート自動取得の失敗", html });
    } catch (err) {
      console.error(`[exchange-rate] failed to notify ${to}:`, err);
    }
  }
}

/**
 * 為替レートの自動更新。1日1回まで（既に当日分を試行済みならスキップ）。失敗・範囲外時は再試行せず、
 * スタッフに通知して手動対応に委ねる（決済に直結する値のため、自動リトライで無理に反映はしない）。
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
      const reason = `取得値 ${rate} が設定範囲（${current.minRate ?? "下限なし"}〜${current.maxRate ?? "上限なし"}）外のため更新を見送りました`;
      await prisma.exchangeRate.update({
        where: { id: EXCHANGE_RATE_ID },
        data: { lastAutoFetchAt: new Date(), lastAutoFetchError: reason },
      });
      console.error(`[exchange-rate] auto-update skipped: rate ${rate} out of bounds`);
      await notifyStaffOfExchangeRateFailure(reason);
      return;
    }

    await prisma.exchangeRate.update({
      where: { id: EXCHANGE_RATE_ID },
      data: { usdJpyRate: rate, lastAutoFetchAt: new Date(), lastAutoFetchError: null },
    });
    console.log(`[exchange-rate] auto-updated to ${rate}`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await prisma.exchangeRate.update({
      where: { id: EXCHANGE_RATE_ID },
      data: { lastAutoFetchAt: new Date(), lastAutoFetchError: reason },
    });
    console.error("[exchange-rate] auto-update failed:", err);
    await notifyStaffOfExchangeRateFailure(reason);
  }
}
