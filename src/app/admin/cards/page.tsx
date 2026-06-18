export const dynamic = "force-dynamic";

import Link from "next/link";
import { getAdminCards } from "@/actions/admin";
import { decrypt } from "@/lib/crypto";
import { CardStatus } from "@prisma/client";
import { format } from "date-fns";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "下書き", color: "bg-gray-100 text-gray-600" },
  SUBMITTED_BY_CUSTOMER: { label: "申込済", color: "bg-brand-100 text-brand-700" },
  RECEIVED_BY_STORE: { label: "受取済", color: "bg-brand-100 text-brand-700" },
  INSPECTION_PENDING: { label: "検品待ち", color: "bg-yellow-100 text-yellow-700" },
  INSPECTED: { label: "検品済", color: "bg-yellow-100 text-yellow-700" },
  READY_FOR_PSA: { label: "PSA準備中", color: "bg-orange-100 text-orange-700" },
  SUBMITTED_TO_PSA: { label: "PSA提出済", color: "bg-purple-100 text-purple-700" },
  PSA_RECEIVED: { label: "PSA受付済", color: "bg-purple-100 text-purple-700" },
  GRADING: { label: "鑑定中", color: "bg-purple-100 text-purple-700" },
  GRADE_AVAILABLE: { label: "グレード確定", color: "bg-green-100 text-green-700" },
  RETURNED_TO_STORE: { label: "店舗返却", color: "bg-green-100 text-green-700" },
  READY_FOR_CUSTOMER_RETURN: { label: "返却準備", color: "bg-teal-100 text-teal-700" },
  RETURNED_TO_CUSTOMER: { label: "返却完了", color: "bg-green-100 text-green-700" },
  UPCHARGE_UNPAID: { label: "Upcharge未払", color: "bg-red-100 text-red-700" },
  UPCHARGE_PAID: { label: "Upcharge済", color: "bg-green-100 text-green-700" },
  PROBLEM: { label: "問題", color: "bg-red-100 text-red-700" },
  CANCELLED: { label: "キャンセル", color: "bg-gray-100 text-gray-600" },
};

export default async function AdminCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { cards, total, page } = await getAdminCards({
    status: sp.status as CardStatus | undefined,
    search: sp.search,
    page: sp.page ? parseInt(sp.page) : 1,
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">カード管理</h1>
        <p className="text-gray-500 text-sm">全{total}件</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <form className="flex flex-wrap gap-3">
          <input
            type="text"
            name="search"
            defaultValue={sp.search}
            placeholder="カード名・管理番号・Cert#で検索"
            className="flex-1 min-w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <select
            name="status"
            defaultValue={sp.status}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">全ステータス</option>
            {Object.entries(STATUS_LABELS).map(([v, { label }]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
          <button
            type="submit"
            className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 transition"
          >
            検索
          </button>
        </form>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">管理番号</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">カード名</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">顧客</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">申告価格</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">PSA情報</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">ステータス</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cards.map((card) => {
                const statusInfo = STATUS_LABELS[card.status] ?? { label: card.status, color: "bg-gray-100 text-gray-600" };
                return (
                  <tr key={card.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{card.cardNo}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{card.cardName}</p>
                      <p className="text-xs text-gray-400">{card.tcgTitle}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-700">{decrypt(card.customer.nameEncrypted)}</p>
                      <p className="text-xs text-gray-400">{card.customer.email}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      ¥{card.declaredValue.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      {card.psaGrade ? (
                        <div>
                          <span className="font-bold text-green-700">Grade {card.psaGrade}</span>
                          {card.psaCertNo && <p className="text-xs text-gray-400">Cert# {card.psaCertNo}</p>}
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Link
                          href={`/admin/cards/${card.id}`}
                          className="text-brand-600 hover:text-brand-800 text-xs font-medium"
                        >
                          詳細
                        </Link>
                        <a
                          href={`/api/qrcode?cardId=${card.id}`}
                          target="_blank"
                          className="text-gray-500 hover:text-gray-700 text-xs font-medium"
                        >
                          QR
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {(page - 1) * 50 + 1}〜{Math.min(page * 50, total)} / {total}件
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`?page=${page - 1}${sp.status ? `&status=${sp.status}` : ""}${sp.search ? `&search=${sp.search}` : ""}`}
                className="text-sm text-brand-600 hover:text-brand-800"
              >
                前へ
              </Link>
            )}
            {page * 50 < total && (
              <Link
                href={`?page=${page + 1}${sp.status ? `&status=${sp.status}` : ""}${sp.search ? `&search=${sp.search}` : ""}`}
                className="text-sm text-brand-600 hover:text-brand-800"
              >
                次へ
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
