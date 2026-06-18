export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCustomerSession } from "@/lib/customer-auth";
import { decrypt } from "@/lib/crypto";
import { getMyApplications } from "@/actions/application";
import { logoutCustomer } from "@/actions/customer";
import { format } from "date-fns";
import { ja } from "date-fns/locale";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "下書き",
  SUBMITTED: "申込済",
  IN_PROGRESS: "処理中",
  COMPLETED: "完了",
  CANCELLED: "キャンセル",
};

const CARD_STATUS_LABELS: Record<string, string> = {
  DRAFT: "下書き",
  SUBMITTED_BY_CUSTOMER: "申込済",
  RECEIVED_BY_STORE: "店舗受取済",
  INSPECTION_PENDING: "検品待ち",
  INSPECTED: "検品済",
  READY_FOR_PSA: "PSA提出準備中",
  SUBMITTED_TO_PSA: "PSA提出済",
  PSA_RECEIVED: "PSA受付済",
  GRADING: "鑑定中",
  GRADE_AVAILABLE: "グレード確定",
  RETURNED_TO_STORE: "店舗返却済",
  READY_FOR_CUSTOMER_RETURN: "返却準備中",
  RETURNED_TO_CUSTOMER: "返却完了",
  UPCHARGE_UNPAID: "Upcharge未払い",
  UPCHARGE_PAID: "Upcharge支払済",
  PROBLEM: "問題発生",
  CANCELLED: "キャンセル",
};

export default async function MypagePage() {
  const customer = await getCustomerSession();
  if (!customer) redirect("/login");

  const name = decrypt(customer.nameEncrypted);
  const applications = await getMyApplications();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="shrink-0 hover:opacity-70 transition">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpg" alt="トレカビンクス" className="h-12 w-auto" />
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{name} 様</span>
            <form action={logoutCustomer}>
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-700">
                ログアウト
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Quick actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href="/apply"
            className="bg-brand-600 text-white rounded-xl p-6 hover:bg-brand-700 transition flex items-center gap-4"
          >
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center text-2xl">📋</div>
            <div>
              <p className="font-bold text-lg">新規PSA申込</p>
              <p className="text-brand-200 text-sm">カードを申し込む</p>
            </div>
          </Link>
          <Link
            href="/mypage/applications"
            className="bg-white border border-gray-200 rounded-xl p-6 hover:border-brand-300 transition flex items-center gap-4"
          >
            <div className="w-10 h-10 bg-brand-50 rounded-lg flex items-center justify-center text-2xl">📦</div>
            <div>
              <p className="font-bold text-lg text-gray-900">申込一覧</p>
              <p className="text-gray-500 text-sm">全{applications.length}件</p>
            </div>
          </Link>
          <Link
            href="/mypage/payment-methods"
            className="bg-white border border-gray-200 rounded-xl p-6 hover:border-brand-300 transition flex items-center gap-4"
          >
            <div className="w-10 h-10 bg-brand-50 rounded-lg flex items-center justify-center text-2xl">💳</div>
            <div>
              <p className="font-bold text-lg text-gray-900">支払い方法</p>
              <p className="text-gray-500 text-sm">登録カード管理</p>
            </div>
          </Link>
          <Link
            href="/mypage/profile"
            className="bg-white border border-gray-200 rounded-xl p-6 hover:border-brand-300 transition flex items-center gap-4"
          >
            <div className="w-10 h-10 bg-brand-50 rounded-lg flex items-center justify-center text-2xl">👤</div>
            <div>
              <p className="font-bold text-lg text-gray-900">登録情報の編集</p>
              <p className="text-gray-500 text-sm">氏名・住所・電話番号</p>
            </div>
          </Link>
        </div>

        {/* Recent applications */}
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-4">最近の申込</h2>
          {applications.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
              申込がありません
            </div>
          ) : (
            <div className="space-y-3">
              {applications.slice(0, 5).map((app) => (
                <Link
                  key={app.id}
                  href={`/mypage/applications/${app.id}`}
                  className="bg-white rounded-xl border border-gray-200 p-5 hover:border-brand-300 transition block"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <span className="font-mono text-sm text-gray-500">{app.applicationNo}</span>
                      <p className="font-bold text-gray-900">{app.cards.length}枚</p>
                    </div>
                    <div className="text-right">
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                        app.status === "COMPLETED" ? "bg-green-100 text-green-700" :
                        app.status === "CANCELLED" ? "bg-gray-100 text-gray-600" :
                        "bg-brand-100 text-brand-700"
                      }`}>
                        {STATUS_LABELS[app.status] ?? app.status}
                      </span>
                      <p className="text-sm font-bold text-gray-900 mt-1">
                        ¥{app.totalAmount.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {app.cards.slice(0, 3).map((card) => (
                      <span
                        key={card.id}
                        className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded"
                      >
                        {card.cardName} — {CARD_STATUS_LABELS[card.status] ?? card.status}
                      </span>
                    ))}
                    {app.cards.length > 3 && (
                      <span className="text-xs text-gray-400">他{app.cards.length - 3}枚</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    {format(new Date(app.createdAt), "yyyy年M月d日", { locale: ja })}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
