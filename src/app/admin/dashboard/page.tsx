import { getDashboardStats } from "@/actions/admin";
import { prisma } from "@/lib/prisma";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { decrypt } from "@/lib/crypto";

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  const recentCards = await prisma.card.findMany({
    take: 10,
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { email: true, nameEncrypted: true } },
      application: { select: { applicationNo: true } },
    },
  });

  const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    DRAFT: { label: "下書き", color: "bg-gray-100 text-gray-600" },
    SUBMITTED_BY_CUSTOMER: { label: "申込済", color: "bg-blue-100 text-blue-700" },
    RECEIVED_BY_STORE: { label: "受取済", color: "bg-blue-100 text-blue-700" },
    INSPECTION_PENDING: { label: "検品待", color: "bg-yellow-100 text-yellow-700" },
    INSPECTED: { label: "検品済", color: "bg-yellow-100 text-yellow-700" },
    READY_FOR_PSA: { label: "PSA準備中", color: "bg-orange-100 text-orange-700" },
    SUBMITTED_TO_PSA: { label: "PSA提出済", color: "bg-purple-100 text-purple-700" },
    PSA_RECEIVED: { label: "PSA受付", color: "bg-purple-100 text-purple-700" },
    GRADING: { label: "鑑定中", color: "bg-purple-100 text-purple-700" },
    GRADE_AVAILABLE: { label: "グレード確定", color: "bg-green-100 text-green-700" },
    RETURNED_TO_STORE: { label: "店舗返却", color: "bg-green-100 text-green-700" },
    READY_FOR_CUSTOMER_RETURN: { label: "返却準備", color: "bg-teal-100 text-teal-700" },
    RETURNED_TO_CUSTOMER: { label: "返却完了", color: "bg-green-100 text-green-700" },
    UPCHARGE_UNPAID: { label: "Upcharge未払", color: "bg-red-100 text-red-700" },
    UPCHARGE_PAID: { label: "Upcharge支払済", color: "bg-green-100 text-green-700" },
    PROBLEM: { label: "問題", color: "bg-red-100 text-red-700" },
    CANCELLED: { label: "キャンセル", color: "bg-gray-100 text-gray-600" },
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">ダッシュボード</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
        {[
          { label: "総申込件数", value: stats.total, color: "bg-blue-500" },
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

      {/* Recent cards */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">最近のカード</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">カード番号</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">カード名</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">顧客</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">ステータス</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">申込日</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recentCards.map((card) => {
                const statusInfo = STATUS_LABELS[card.status] ?? { label: card.status, color: "bg-gray-100 text-gray-600" };
                return (
                  <tr key={card.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{card.cardNo}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{card.cardName}</p>
                      <p className="text-xs text-gray-400">{card.tcgTitle}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{decrypt(card.customer.nameEncrypted)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {format(new Date(card.createdAt), "MM/dd HH:mm")}
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
