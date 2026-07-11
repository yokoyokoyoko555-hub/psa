export const dynamic = "force-dynamic";

import { getDashboardStats } from "@/actions/admin";
import { prisma } from "@/lib/prisma";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { decrypt } from "@/lib/crypto";
import { computeDisplayStatus } from "@/lib/application-status";

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

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  const recentApplications = await prisma.application.findMany({
    where: { status: { not: "DRAFT" } },
    take: 10,
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { email: true, nameEncrypted: true } },
      _count: { select: { cards: true } },
      payments: { select: { status: true } },
      psaSubmissionGroup: { select: { status: true, submittedAt: true, returnReadyAt: true, returnedAt: true } },
    },
  });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">ダッシュボード</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
        {[
          { label: "総申込件数", value: stats.total, color: "bg-brand-500" },
          { label: "PSA提出待ち", value: stats.psaWaiting, color: "bg-orange-500" },
          { label: "PSA返却待ち", value: stats.psaReturning, color: "bg-purple-500" },
          { label: "未払い", value: stats.unpaid, color: "bg-red-500" },
          { label: "Upcharge件数", value: stats.upchargeCount, color: "bg-yellow-500" },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className={`w-8 h-1 ${stat.color} rounded mb-3`} />
            <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
            <p className="text-sm text-gray-500 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Recent applications */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">最近の申込</h2>
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
                const statusLabel = app.status === "CANCELLED" ? "キャンセル" : computeDisplayStatus(app);
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
