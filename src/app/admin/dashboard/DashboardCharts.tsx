"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";

type DailyBucket = {
  day: number;
  revenue: number;
  count: number;
  regionJP: number;
  regionUS: number;
  sourceCustomer: number;
  sourceStore: number;
};

type Pattern = "revenue" | "count" | "region" | "source";

const PATTERN_LABELS: Record<Pattern, string> = {
  revenue: "日別売上",
  count: "申込件数",
  region: "提出先別",
  source: "入力経路別",
};

const BRAND_DARK = "#6b0505";
const BRAND_LIGHT = "#cc5a5a";
const BRAND_PALE = "#e09090";

// Chart.jsはnpm installが使えない環境事情のためCDN読み込み（node_modules破損。ローンチ前にnpm依存へ移行予定）
const CHARTJS_SRC = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js";

declare global {
  interface Window {
    Chart: unknown;
  }
}

export default function DashboardCharts({
  daily,
  regionTotals,
  sourceTotals,
  month,
}: {
  daily: DailyBucket[];
  regionTotals: { jp: number; us: number };
  sourceTotals: { customer: number; store: number };
  month: number;
}) {
  const [pattern, setPattern] = useState<Pattern>("revenue");
  const [chartReady, setChartReady] = useState(
    typeof window !== "undefined" && Boolean(window.Chart)
  );
  const barCanvasRef = useRef<HTMLCanvasElement>(null);
  const donutCanvasRef = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (!chartReady) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Chart = window.Chart as any;
    chartInstanceRef.current?.destroy();

    if (pattern === "revenue" || pattern === "count") {
      const canvas = barCanvasRef.current;
      if (!canvas) return;
      const values = daily.map((d) => (pattern === "revenue" ? d.revenue : d.count));
      const labels = daily.map((d) => `${month}/${String(d.day).padStart(2, "0")}`);
      const isYen = pattern === "revenue";
      chartInstanceRef.current = new Chart(canvas, {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              data: values,
              backgroundColor: (c: { chart: { chartArea?: unknown; ctx: CanvasRenderingContext2D } }) => {
                const area = c.chart.chartArea as { top: number; bottom: number } | undefined;
                if (!area) return BRAND_DARK;
                const g = c.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
                g.addColorStop(0, BRAND_LIGHT);
                g.addColorStop(1, BRAND_DARK);
                return g;
              },
              borderRadius: 4,
              maxBarThickness: 22,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (i: { raw: number }) => (isYen ? `¥${i.raw.toLocaleString()}` : `${i.raw}件`),
              },
            },
          },
          scales: {
            x: { grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 8 } },
            y: {
              grid: { color: "rgba(120,120,120,0.15)" },
              ticks: { callback: (v: number) => (isYen ? `${Math.round(v / 10000)}万` : Math.round(v)) },
            },
          },
        },
      });
    } else {
      const canvas = donutCanvasRef.current;
      if (!canvas) return;
      const [vals, labels, colors] =
        pattern === "region"
          ? [[regionTotals.jp, regionTotals.us], ["PSA日本", "PSA US"], [BRAND_DARK, BRAND_LIGHT]]
          : [[sourceTotals.customer, sourceTotals.store], ["自己入力", "代理入力"], [BRAND_DARK, BRAND_PALE]];
      chartInstanceRef.current = new Chart(canvas, {
        type: "doughnut",
        data: { labels, datasets: [{ data: vals, backgroundColor: colors, borderColor: "#fff", borderWidth: 2 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: "62%" },
      });
    }

    return () => chartInstanceRef.current?.destroy();
  }, [pattern, chartReady, daily, regionTotals, sourceTotals, month]);

  const isDonut = pattern === "region" || pattern === "source";
  const donutData =
    pattern === "region"
      ? { labels: ["PSA日本", "PSA US"], values: [regionTotals.jp, regionTotals.us], colors: [BRAND_DARK, BRAND_LIGHT] }
      : { labels: ["自己入力", "代理入力"], values: [sourceTotals.customer, sourceTotals.store], colors: [BRAND_DARK, BRAND_PALE] };
  const donutTotal = donutData.values.reduce((a, b) => a + b, 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <Script src={CHARTJS_SRC} strategy="afterInteractive" onLoad={() => setChartReady(true)} />
      <div className="flex flex-wrap gap-2 mb-5">
        {(Object.keys(PATTERN_LABELS) as Pattern[]).map((p) => (
          <button
            key={p}
            onClick={() => setPattern(p)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition ${
              pattern === p
                ? "bg-brand-600 text-white border-brand-600"
                : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
            }`}
          >
            {PATTERN_LABELS[p]}
          </button>
        ))}
      </div>

      {!chartReady ? (
        <p className="text-sm text-gray-400 py-10 text-center">グラフを読み込み中...</p>
      ) : (
        <>
          <div className={isDonut ? "hidden" : "relative w-full"} style={{ height: 280 }}>
            <canvas ref={barCanvasRef} role="img" aria-label="日別データの棒グラフ" />
          </div>

          {isDonut && (
            <div className="flex items-center gap-6 flex-wrap">
              <div className="relative shrink-0" style={{ width: 220, height: 220 }}>
                <canvas ref={donutCanvasRef} role="img" aria-label="構成比のドーナツグラフ" />
              </div>
              <div className="flex-1 min-w-[160px] text-sm space-y-2">
                {donutData.labels.map((label, i) => (
                  <div key={label} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-gray-700">
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: donutData.colors[i] }}
                      />
                      {label}
                    </span>
                    <span className="font-medium text-gray-900">
                      {donutData.values[i]}件（{donutTotal > 0 ? Math.round((donutData.values[i] / donutTotal) * 100) : 0}%）
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
