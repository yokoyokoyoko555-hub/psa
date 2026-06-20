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
  const latestDraft = applications.find((a) => a.status === "DRAFT");

  const SERVICE_LABELS: Record<string, string> = {
    VALUE: "バリュー",
    VALUE_BULK: "バリューバルク",
    VALUE_PLUS: "バリュープラス",
    VALUE_MAX: "バリューマックス",
    REGULAR: "レギュラー",
    EXPRESS: "エクスプレス",
    SUPER_EXPRESS: "スーパー・エクスプレス",
    WALK_THROUGH: "ウォーク・スルー",
    PREMIUM_1: "プレミアム 1",
    PREMIUM_2: "プレミアム 2",
    PREMIUM_3: "プレミアム 3",
    PREMIUM_5: "プレミアム 5",
    PREMIUM_10: "プレミアム 10",
  };

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
            <span className="text-sm text-gray-600">
              {customer.memberNo ? `${customer.memberNo}　` : ""}{name} 様
            </span>
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
          <Link
            href="/mypage/addresses"
            className="bg-white border border-gray-200 rounded-xl p-6 hover:border-brand-300 transition flex items-center gap-4"
          >
            <div className="w-10 h-10 bg-brand-50 rounded-lg flex items-center justify-center text-2xl">📍</div>
            <div>
              <p className="font-bold text-lg text-gray-900">住所帳</p>
              <p className="text-gray-500 text-sm">返送先住所の管理</p>
            </div>
          </Link>
        </div>

        {/* この申込を続ける（直近の作業中） */}
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-4">この申込を続ける</h2>
          <div className="bg-white rounded-2xl border border-gray-200">
            {latestDraft ? (
              <div className="p-6">
                <p className="text-gray-700 mb-4">この申込の続きから再開します。</p>
                <div className="border border-gray-200 rounded-xl p-5">
                  <p className="text-gray-900">
                    {SERVICE_LABELS[latestDraft.serviceLevel] ?? latestDraft.serviceLevel}
                  </p>
                  <p className="text-gray-500 text-sm mt-1">
                    {format(new Date(latestDraft.createdAt), "yyyy年M月d日", { locale: ja })}
                  </p>
                  <p className="text-red-500 text-sm mt-1">下書き</p>
                </div>
                <Link
                  href={`/apply?draft=${latestDraft.id}`}
                  className="inline-flex items-center gap-2 text-gray-700 hover:text-brand-700 mt-4 text-sm"
                >
                  ✏️ 下書きの編集
                </Link>
              </div>
            ) : (
              <div className="p-6 text-center text-gray-400 text-sm">作業中の申込はありません</div>
            )}
            <Link
              href="/mypage/applications"
              className="flex items-center justify-between p-5 border-t border-gray-100 hover:bg-gray-50"
            >
              <span className="font-medium text-gray-900">すべての作業中の申込を表示</span>
              <span className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-400">
                ›
              </span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
