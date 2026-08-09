// instrumentation.tsからnodejs runtime時のみrequireされる。ここでPrisma等のNode専用処理を行ってよい。
import { runAutoExchangeRateUpdateIfDue } from "@/lib/exchange-rate";

const check = () => {
  runAutoExchangeRateUpdateIfDue().catch((err) => console.error("[exchange-rate] scheduled check failed:", err));
};

check();
setInterval(check, 60 * 60 * 1000);
