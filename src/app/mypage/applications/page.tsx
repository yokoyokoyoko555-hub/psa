export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCustomerSession } from "@/lib/customer-auth";
import { getMyApplications } from "@/actions/application";
import { format } from "date-fns";
import { ja } from "date-fns/locale";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "下書き", color: "bg-gray-100 text-gray-600" },
  SUBMITTED: { label: "申込済", color: "bg-blue-100 text-blue-700" },
  IN_PROGRESS: { label: "処理中", color: "bg-yellow-100 text-yellow-700" },
  COMPLETED: { label: "完了", color: "bg-green-100 text-green-700" },
  CANCELLED: { label: "キャンセル", color: "bg-red-100 text-red-700" },
};

export default async function ApplicationsPage() {
  const customer = await getCustomerSession();
  if (!customer) redirect("/login");

  const applications = await getMyApplications();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <Link href="/mypage" className="text-gray-500 hover:text-gray-700">← マイページ</Link>
          <h1 className="font-bold text-gray-900">申込一覧</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {applications.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
            <p className="text-gray-500 mb-4">まだ申込がありません</p>
            <Link href="/apply" className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-blue-700 transition">
              PSA申込を始める
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {applications.map((app) => {
              const statusInfo = STATUS_LABELS[app.status] ?? { label: app.status, color: "bg-gray-100 text-gray-600" };
              const payment = app.payments[0];
              return (
                <Link
                  key={app.id}
                  href={`/mypage/applications/${app.id}`}
                  className="bg-white rounded-xl border border-gray-200 p-6 hover:border-blue-300 transition block"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-mono text-sm text-gray-500 mb-1">{app.applicationNo}</p>
                      <p className="font-bold text-gray-900">{app.cards.length}枚のカード</p>
                      <p className="text-gray-500 text-sm mt-1">
                        {format(new Date(app.createdAt), "yyyy年M月d日 HH:mm", { locale: ja })}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                      <p className="text-lg font-bold text-gray-900 mt-2">
                        ¥{app.totalAmount.toLocaleString()}
                      </p>
                      {payment && (
                        <p className={`text-xs mt-1 ${payment.status === "SUCCEEDED" ? "text-green-600" : "text-red-500"}`}>
                          {payment.status === "SUCCEEDED" ? "支払済" : "未払い"}
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
