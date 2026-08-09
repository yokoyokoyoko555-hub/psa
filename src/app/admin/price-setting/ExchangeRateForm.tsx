"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveExchangeRate, testFetchExchangeRate } from "@/actions/pricing";

export default function ExchangeRateForm({
  usdJpyRate,
  marginPercent,
  autoUpdate,
  minRate,
  maxRate,
  lastAutoFetchAt,
  lastAutoFetchError,
}: {
  usdJpyRate: number;
  marginPercent: number;
  autoUpdate: boolean;
  minRate: number | null;
  maxRate: number | null;
  lastAutoFetchAt: Date | null;
  lastAutoFetchError: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rate, setRate] = useState(String(usdJpyRate));
  const [margin, setMargin] = useState(String(marginPercent));
  const [auto, setAuto] = useState(autoUpdate);
  const [min, setMin] = useState(minRate != null ? String(minRate) : "");
  const [max, setMax] = useState(maxRate != null ? String(maxRate) : "");
  const [message, setMessage] = useState("");
  const [isTesting, startTest] = useTransition();
  const [testResult, setTestResult] = useState("");

  const rateNum = parseFloat(rate) || 0;
  const marginNum = parseFloat(margin) || 0;
  const effectiveRate = rateNum * (1 + marginNum / 100);

  function save() {
    setMessage("");
    startTransition(async () => {
      const res = await saveExchangeRate({
        usdJpyRate: rateNum,
        marginPercent: marginNum,
        autoUpdate: auto,
        minRate: min === "" ? null : parseFloat(min),
        maxRate: max === "" ? null : parseFloat(max),
      });
      setMessage(res.success ? "保存しました" : res.error ?? "保存に失敗しました");
      if (res.success) router.refresh();
    });
  }

  function test() {
    setTestResult("");
    startTest(async () => {
      const res = await testFetchExchangeRate();
      setTestResult(
        res.success ? `取得成功: $1 = ¥${res.rate}（この場では保存されません）` : `取得失敗: ${res.error ?? "不明なエラー"}`
      );
    });
  }

  const inputCls = "w-32 border border-gray-300 rounded px-2 py-1 text-sm text-gray-900";

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        PSA USの鑑定料等（USD建て）を、決済時にJPYへ換算するためのレートです。
        実効レート = 実勢レート ×（1 + マージン%）。決済は常にこの実効レートでJPY換算して行われます。
      </p>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-28 text-sm text-gray-700">実勢レート</span>
          <input type="number" min={0} step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} className={inputCls} />
          <span className="text-sm text-gray-600">円 / $1</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-28 text-sm text-gray-700">マージン</span>
          <input type="number" min={0} step="0.1" value={margin} onChange={(e) => setMargin(e.target.value)} className={inputCls} />
          <span className="text-sm text-gray-600">%</span>
        </div>
        <p className="text-sm text-gray-700">
          実効レート: <span className="font-bold">$1 = ¥{effectiveRate.toFixed(2)}</span>
        </p>
      </div>

      <div className="border-t border-gray-100 pt-4 space-y-3">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          実勢レートを毎日自動更新する（外部為替APIから取得）
        </label>
        <p className="text-xs text-gray-500">
          有効にすると、上の「実勢レート」欄は1日1回、外部APIの取得値で自動的に上書きされます。
          取得値が下限〜上限の範囲外だった場合は更新を見送り、手動設定した値のまま維持されます。
        </p>
        <div className="flex items-center gap-2">
          <span className="w-28 text-sm text-gray-700">下限</span>
          <input
            type="number"
            min={0}
            step="0.01"
            placeholder="未設定"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            className={inputCls}
            disabled={!auto}
          />
          <span className="text-sm text-gray-600">円 / $1</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-28 text-sm text-gray-700">上限</span>
          <input
            type="number"
            min={0}
            step="0.01"
            placeholder="未設定"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            className={inputCls}
            disabled={!auto}
          />
          <span className="text-sm text-gray-600">円 / $1</span>
        </div>
        {lastAutoFetchAt && (
          <p className="text-xs text-gray-500">
            最終自動取得: {lastAutoFetchAt.toLocaleString("ja-JP")}
            {lastAutoFetchError ? (
              <span className="text-red-600">（見送り・失敗: {lastAutoFetchError}）</span>
            ) : (
              <span className="text-green-700">（成功）</span>
            )}
          </p>
        )}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={test}
            disabled={isTesting}
            className="border border-gray-300 text-gray-700 font-bold px-4 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm"
          >
            {isTesting ? "取得中..." : "今すぐ取得テスト"}
          </button>
          {testResult && <span className="text-sm text-gray-700">{testResult}</span>}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {message && <span className="text-green-700 text-sm">{message}</span>}
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="bg-brand-600 text-white font-bold px-6 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50 text-sm"
        >
          {isPending ? "保存中..." : "保存"}
        </button>
      </div>
    </div>
  );
}
