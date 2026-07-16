export const dynamic = "force-dynamic";

import Link from "next/link";
import { getDashboardActionItems } from "@/actions/admin";
import { getDashboardMetrics } from "@/actions/dashboard";
import { prisma } from "@/lib/prisma";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { decrypt } from "@/lib/crypto";
import { computeListDisplayStatus } from "@/lib/application-status";
import { formatMoneyIn } from "@/lib/currency";
import MonthSelector from "./MonthSelector";
import DashboardCharts from "./DashboardCharts";

// カード単位のステータスは持たない（申込単位のみ）。ADR-0065/0066
const STATUS_BADGE_CLS: Record<string, string> = {
  申込完了: "bg-blue-50 text-blue-700",
  入力完了: "bg-indigo-50 text-indigo-700",
  支払完了: "bg-cyan-50 text-cyan-700",
  受取完了: "bg-amber-50 text-amber-700",
  発送完了: "bg-purple-50 text-purple-700",
  返送準備中: "bg-teal-50 text-teal-700",
  返送完了: "bg-green-50 text-green-700",
  店頭受取可能: "bg-teal-50 text-teal-700",
  店頭受取完了: "bg-green-50 text-green-700",
  キャンセル: "bg-gray-100 text-gray-500",
};

function formatDelta(value: number, unit: "yen" | "count") {
  const sign = value > 0 ? "+" : "";
  const body = unit === "yen" ? formatMoneyIn(Math.abs(value), "JPY") : `${Math.abs(value)}件`;
  return `前月比 ${value < 0 ? "-" : sign}${body}`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const year = Number(sp.year) || now.getFullYear();
  const month = Number(sp.month) || now.getMonth() + 1;

  const [actionItems, metrics, recentApplications] = await Promise.all([
    getDashboardActionItems(),
    getDashboardMetrics(year, month),
    prisma.application.findMany({
      where: { status: { not: "DRAFT" } },
      take: 5,
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { email: true, nameEncrypted: true } },
        _count: { select: { cards: true } },
        payments: { select: { status: true } },
        psaSubmissionGroup: { select: { status: true, submittedAt: true, returnReadyAt: true, returnedAt: true } },
        groupMemberships: {
          include: { psaSubmissionGroup: { select: { status: true, submittedAt: true, returnReadyAt: true, returnedAt: true } } },
        },
      },
    }),
  ]);

  const actionCards = [
    { label: "代理入力待ち", value: actionItems.proxyInputPending, icon: "📋", href: "/admin/store-requests" },
    { label: "PSA発送待ち", value: actionItems.psaShippingPending, icon: "📦", href: "/admin/psa-groups" },
    { label: "顧客返却待ち", value: actionItems.customerReturnPending, icon: "🚚", href: "/admin/psa-groups" },
    { label: "未回答の問い合わせ", value: actionItems.unansweredInquiries, icon: "💬", href: "/admin/inquiries" },
  ];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>
        <MonthSelector year={year} month={month} />
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-1">申込数</p>
          <p className="text-2xl font-bold text-brand-700">{metrics.kpi.count}件</p>
          <p className="text-xs text-gray-400 mt-1">{formatDelta(metrics.kpi.countDelta, "count")}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-1">売上</p>
          <p className="text-2xl font-bold text-brand-700">{formatMoneyIn(metrics.kpi.revenue, "JPY")}</p>
          <p className="text-xs text-gray-400 mt-1">{formatDelta(metrics.kpi.revenueDelta, "yen")}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-1">客単価</p>
          <p className="text-2xl font-bold text-brand-700">{formatMoneyIn(Math.round(metrics.kpi.avgOrderValue), "JPY")}</p>
          <p className="text-xs text-gray-400 mt-1">{formatDelta(metrics.kpi.avgOrderValueDelta, "yen")}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-1">利益</p>
          <p className="text-2xl font-bold text-brand-700">{formatMoneyIn(Math.round(metrics.kpi.profit), "JPY")}</p>
          <p className="text-xs text-gray-400 mt-1">{formatDelta(metrics.kpi.profitDelta, "yen")}</p>
        </div>
      </div>

      {/* Action items */}
      <div className="mb-2 text-sm font-bold text-gray-700">対応が必要な内容</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {actionCards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="bg-white rounded-xl border border-gray-200 p-4 hover:border-brand-300 transition"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xl" aria-hidden="true">{c.icon}</span>
              <span className={`text-xl font-bold ${c.value > 0 ? "text-amber-600" : "text-gray-300"}`}>
                {c.value}
              </span>
            </div>
            <p className="text-sm text-gray-700">{c.label}</p>
          </Link>
        ))}
      </div>

      {/* Charts */}
      <div className="mb-8">
        <DashboardCharts
          daily={metrics.daily}
          regionTotals={metrics.regionTotals}
          sourceTotals={metrics.sourceTotals}
          month={month}
        />
      </div>

      {/* Recent applications */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">最近の申込</h2>
          <Link href="/admin/applications" className="text-sm text-brand-600 hover:underline">
            もっと見る →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">申込番号</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">顧客</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">枚数</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">ステータス</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">申込日</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recentApplications.map((app) => {
                const rawStatus = app.status === "CANCELLED" ? "キャンセル" : computeListDisplayStatus(app);
                const statusLabel = rawStatus === "MULTIPLE" ? "複数グループ" : rawStatus;
                return (
                  <tr key={app.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{app.applicationNo}</td>
                    <td className="px-4 py-3 text-gray-600">{decrypt(app.customer.nameEncrypted)}</td>
                    <td className="px-4 py-3 text-gray-700">{app._count.cards}枚</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_BADGE_CLS[statusLabel] ?? "bg-green-50 text-green-700"}`}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {format(new Date(app.createdAt), "MM/dd HH:mm", { locale: ja })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
