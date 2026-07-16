export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCustomerSession } from "@/lib/customer-auth";
import { prisma } from "@/lib/prisma";
import { getMyApplications } from "@/actions/application";
import CustomerHeader from "@/components/CustomerHeader";
import Footer from "@/components/Footer";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { REGION_LABELS, ITEM_TYPE_LABELS, SERVICE_LABELS } from "@/lib/application-status";

export default async function MypagePage() {
  const customer = await getCustomerSession();
  if (!customer) redirect("/login");

  const [applications, notifications, storeSettings] = await Promise.all([
    getMyApplications(),
    prisma.notification.findMany({
      where: {
        isPublished: true,
        showOnMypage: true,
        OR: [{ customerId: null }, { customerId: customer.id }],
      },
      orderBy: { createdAt: "desc" },
      take: 2,
    }),
    prisma.storeSettings.findUnique({ where: { id: "default" } }),
  ]);
  const latestDraft = applications.find((a) => a.status === "DRAFT");
  // 精度・操作性の改善が済むまで管理画面のスイッチで一時的に非表示にできる。ADR-0070
  const centeringToolEnabled = storeSettings?.centeringToolEnabled ?? true;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <CustomerHeader title="マイページ" />

      <main className="flex-1 max-w-4xl mx-auto px-4 py-8 space-y-6">
        {notifications.length > 0 && (
          <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-brand-600 text-white px-4 py-3">
              <h2 className="font-bold">お知らせ</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 px-6 pt-3">
              {notifications.map((n) => (
                <Link
                  key={n.id}
                  href={`/mypage/notifications/${n.id}`}
                  className="flex items-center justify-between gap-4 border-b border-gray-200 py-3 hover:bg-gray-50 transition"
                >
                  <span className="min-w-0">
                    <span className="block text-sm text-gray-900 mb-1">
                      {format(new Date(n.createdAt), "yyyy年MM月dd日")}
                    </span>
                    <span
                      className={`block font-bold leading-6 ${
                        n.title.includes("重要") ? "text-brand-700" : "text-brand-600"
                      }`}
                    >
                      {n.title}
                    </span>
                  </span>
                  <span className="text-3xl leading-none text-brand-600 shrink-0">›</span>
                </Link>
              ))}
            </div>
            <div className="flex justify-end px-4 py-3">
              <Link
                href="/mypage/notifications"
                className="inline-flex items-center gap-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm font-bold text-brand-600 hover:bg-brand-50"
              >
                もっと見る <span className="text-xl leading-none">›</span>
              </Link>
            </div>
          </section>
        )}

        {/* Quick actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href="/apply"
            className="bg-white border border-gray-200 rounded-xl p-6 hover:border-brand-300 transition flex items-center gap-4"
          >
            <div className="w-10 h-10 bg-brand-50 rounded-lg flex items-center justify-center text-2xl">📋</div>
            <div>
              <p className="font-bold text-lg text-gray-900">新規申込</p>
              <p className="text-gray-500 text-sm">鑑定を申し込む</p>
            </div>
          </Link>
          <Link
            href="/how-to-apply"
            className="bg-white border border-gray-200 rounded-xl p-6 hover:border-brand-300 transition flex items-center gap-4"
          >
            <div className="w-10 h-10 bg-brand-50 rounded-lg flex items-center justify-center text-2xl">🗺️</div>
            <div>
              <p className="font-bold text-lg text-gray-900">申込の流れ</p>
              <p className="text-gray-500 text-sm">自己入力・代理入力の流れを確認</p>
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
            href="/mypage/submission-booking"
            className="bg-white border border-gray-200 rounded-xl p-6 hover:border-brand-300 transition flex items-center gap-4"
          >
            <div className="w-10 h-10 bg-brand-50 rounded-lg flex items-center justify-center text-2xl">📅</div>
            <div>
              <p className="font-bold text-lg text-gray-900">提出予約</p>
              <p className="text-gray-500 text-sm">店頭持込・郵送予定の予約</p>
            </div>
          </Link>
          {centeringToolEnabled && (
            <Link
              href="/mypage/centering"
              className="bg-white border border-gray-200 rounded-xl p-6 hover:border-brand-300 transition flex items-center gap-4"
            >
              <div className="w-10 h-10 bg-brand-50 rounded-lg flex items-center justify-center text-2xl">◎</div>
              <div>
                <p className="font-bold text-lg text-gray-900">センタリング測定</p>
                <p className="text-gray-500 text-sm">無料・カメラでセンタリングを測定</p>
              </div>
            </Link>
          )}
          <Link
            href="/pricing"
            className="bg-white border border-gray-200 rounded-xl p-6 hover:border-brand-300 transition flex items-center gap-4"
          >
            <div className="w-10 h-10 bg-brand-50 rounded-lg flex items-center justify-center text-2xl">💴</div>
            <div>
              <p className="font-bold text-lg text-gray-900">料金表</p>
              <p className="text-gray-500 text-sm">鑑定料・送料・手数料を確認</p>
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
                  <div className="grid grid-cols-3 gap-4 text-sm mb-3">
                    <div>
                      <p className="text-gray-500">提出先</p>
                      <p className="font-medium text-gray-900">
                        {REGION_LABELS[latestDraft.region] ?? latestDraft.region}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">アイテム</p>
                      <p className="font-medium text-gray-900">
                        {ITEM_TYPE_LABELS[latestDraft.itemType] ?? latestDraft.itemType}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">サービス</p>
                      <p className="font-medium text-gray-900">
                        {latestDraft.customServiceLevelName ?? SERVICE_LABELS[latestDraft.serviceLevel] ?? "サービス未選択"}
                      </p>
                    </div>
                  </div>
                  <p className="text-gray-500 text-sm">
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

      <Footer />
    </div>
  );
}
