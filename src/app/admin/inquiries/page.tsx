export const dynamic = "force-dynamic";

import Link from "next/link";
import { getInquiries } from "@/actions/inquiry";
import { format } from "date-fns";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  UNREAD: { label: "未読", color: "bg-red-100 text-red-700" },
  READ: { label: "既読", color: "bg-amber-50 text-amber-700" },
  REPLIED: { label: "返信済", color: "bg-green-100 text-green-700" },
};

export default async function InquiriesPage() {
  const inquiries = await getInquiries();
  const unreadCount = inquiries.filter((i) => i.status === "UNREAD").length;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">お問い合わせ</h1>
        {unreadCount > 0 && (
          <span className="bg-red-100 text-red-700 text-sm font-bold px-3 py-1 rounded-full">
            未読 {unreadCount}件
          </span>
        )}
      </div>

      {inquiries.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
          お問い合わせはありません
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">状態</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">顧客</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">件名</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">受信日時</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {inquiries.map((i) => {
                const statusInfo = STATUS_LABELS[i.status] ?? { label: i.status, color: "bg-gray-100 text-gray-600" };
                return (
                  <tr key={i.id} className={i.status === "UNREAD" ? "bg-red-50/30" : "hover:bg-gray-50"}>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/customers/${i.customerId}`}
                        className="text-gray-900 hover:text-brand-600 hover:underline"
                      >
                        {i.customerName}
                      </Link>
                      <p className="text-xs text-gray-400">{i.customerEmail}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{i.subject}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {format(new Date(i.createdAt), "yyyy/MM/dd HH:mm")}
                      {i.allowCustomerReply && (
                        <p className="text-xs text-brand-600 mt-1">顧客返信可</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/inquiries/${i.id}`}
                        className="border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50 transition"
                      >
                        詳細を見る
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
