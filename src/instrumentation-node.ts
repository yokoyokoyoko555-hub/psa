// instrumentation.tsからnodejs runtime時のみrequireされる。ここでPrisma等のNode専用処理を行ってよい。
import { runAutoExchangeRateUpdateIfDue } from "@/lib/exchange-rate";

// 失敗時は再試行せずスタッフ通知のみ（ADR: exchange-rate.ts参照）なので、頻繁な監視は不要。
// サーバー起動時に1回・以降24時間おきにチェックすれば、1日1回の自動取得を取りこぼさない。
const check = () => {
  runAutoExchangeRateUpdateIfDue().catch((err) => console.error("[exchange-rate] scheduled check failed:", err));
};

check();
setInterval(check, 24 * 60 * 60 * 1000);
