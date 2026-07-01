export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { format } from "date-fns";
import Link from "next/link";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "下書き", color: "bg-gray-100 text-gray-600" },
  SUBMITTED: { label: "申込済", color: "bg-brand-100 text-brand-700" },
  IN_PROGRESS: { label: "処理中", color: "bg-yellow-100 text-yellow-700" },
  COMPLETED: { label: "完了", color: "bg-green-100 text-green-700" },
  CANCELLED: { label: "キャンセル", color: "bg-red-100 text-red-700" },
};

export default async function AdminApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const page = sp.page ? parseInt(sp.page) : 1;
  const limit = 50;

  // 申込管理は自己入力(CUSTOMER)のみ。代理入力(STORE)は「代理申込」画面で扱う。
  const where = {
    source: "CUSTOMER" as const,
    ...(sp.status ? { status: sp.status as "DRAFT" | "SUBMITTED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" } : {}),
  };

  const [applications, total] = await Promise.all([
    prisma.application.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        customer: { select: { nameEncrypted: true, email: true } },
        _count: { select: { cards: true } },
        payments: { select: { status: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.application.count({ where }),
  ]);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">申込管理（自己入力）</h1>
        <p className="text-gray-500 text-sm">全{total}件</p>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 mb-6">
        {[
          { value: "", label: "すべて" },
          { value: "SUBMITTED", label: "申込済" },
          { value: "IN_PROGRESS", label: "処理中" },
          { value: "COMPLETED", label: "完了" },
        ].map((f) => (
          <Link
            key={f.value}
            href={`?status=${f.value}`}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              (sp.status ?? "") === f.value
                ? "bg-brand-600 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">申込番号</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">顧客</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">枚数</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">金額</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">決済</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">ステータス</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">日時</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {applications.map((app) => {
              const statusInfo = STATUS_LABELS[app.status] ?? { label: app.status, color: "bg-gray-100 text-gray-600" };
              const paid = app.payments.some((p) => p.status === "SUCCEEDED");
              return (
                <tr key={app.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link href={`/admin/applications/${app.id}`} className="text-brand-600 hover:underline">
                      {app.applicationNo}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-gray-900">{decrypt(app.customer.nameEncrypted)}</p>
                    <p className="text-xs text-gray-400">{app.customer.email}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{app._count.cards}枚</td>
                  <td className="px-4 py-3 font-medium text-gray-900">¥{app.totalAmount.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${paid ? "text-green-600" : "text-red-500"}`}>
                      {paid ? "支払済" : "未払い"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {format(new Date(app.createdAt), "MM/dd HH:mm")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
