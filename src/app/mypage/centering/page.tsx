export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCustomerSession } from "@/lib/customer-auth";
import { getCenteringAccess, getMyMeasurements } from "@/actions/centering";
import { getStoreSettings } from "@/actions/store-settings";
import { formatRatio } from "@/lib/centering";
import CustomerHeader from "@/components/CustomerHeader";
import Footer from "@/components/Footer";
import { SubscribeButton, ManageSubscriptionButton } from "./CenteringPlanButtons";
import { format } from "date-fns";

export const metadata = { title: "センタリング測定 | トレカビンクス" };

export default async function CenteringPage({
  searchParams,
}: {
  searchParams: Promise<{ subscribed?: string }>;
}) {
  const customer = await getCustomerSession();
  if (!customer) redirect("/login");

  const { subscribed } = await searchParams;
  const [aiEnabled, measurements, storeSettings] = await Promise.all([
    getCenteringAccess(),
    getMyMeasurements(),
    getStoreSettings(),
  ]);

  // 精度・操作性の改善が済むまで管理画面のスイッチで一時的に非表示にできる。ADR-0070
  if (!(storeSettings?.centeringToolEnabled ?? true)) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <CustomerHeader title="センタリング測定" />
        <main className="flex-1 max-w-2xl mx-auto px-4 py-8">
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center space-y-2">
            <p className="font-bold text-gray-900">ただいま調整中です</p>
            <p className="text-sm text-gray-500">
              センタリング測定ツールは現在ご利用いただけません。準備が整い次第、改めてご案内いたします。
            </p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <CustomerHeader
        title="センタリング測定"
        actions={
          <Link
            href="/apply"
            className="shrink-0 bg-brand-600 text-white rounded-full px-4 py-1.5 text-sm font-bold hover:bg-brand-700 transition"
          >
            新規申込
          </Link>
        }
      />

      <main className="flex-1 max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* 無料の手動測定（誰でも利用可） */}
        <Link
          href="/mypage/centering/measure"
          className="block bg-brand-600 text-white rounded-2xl p-6 hover:bg-brand-700 transition"
        >
          <p className="text-lg font-bold">📷 測定する（{aiEnabled ? "AIプラン" : "無料プラン"}）</p>
          <p className="text-sm text-white/80 mt-1">
            {aiEnabled
              ? "撮影／取り込みでAIが枠を自動検出し、瞬時に測定します"
              : "カードの表裏を撮影し、ガイドを合わせてセンタリングを測定します"}
          </p>
        </Link>

        {subscribed === "1" && !aiEnabled && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">
            ご加入ありがとうございます。反映まで少し時間がかかる場合があります。数十秒後にページを更新してください。
          </div>
        )}

        {/* AIプラン案内 / 利用中 */}
        {aiEnabled ? (
          <div className="bg-white rounded-2xl border border-brand-200 p-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center text-brand-600">✨</div>
              <div>
                <p className="font-bold text-gray-900">AIプラン利用中</p>
                <p className="text-sm text-gray-500">撮影/取り込みでAIが枠を自動検出し、瞬時に測定</p>
              </div>
            </div>
            <ManageSubscriptionButton />
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center text-brand-600">✨</div>
              <div>
                <p className="font-bold text-gray-900">AIプラン <span className="text-sm font-normal text-gray-500">¥550/月（税込）</span></p>
                <p className="text-sm text-gray-500">AIがカード枠を自動検出。ガイド合わせ不要で、誰でも瞬時に測定</p>
              </div>
            </div>
            <SubscribeButton />
            <p className="text-xs text-gray-400 text-center">手動の測定は無料でご利用いただけます。いつでも解約可能です。</p>
          </div>
        )}

        {/* 履歴 */}
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-3">測定履歴</h2>
          {measurements.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
              まだ測定がありません
            </div>
          ) : (
            <div className="space-y-3">
              {measurements.map((m) => (
                <Link
                  key={m.id}
                  href={`/mypage/centering/${m.id}`}
                  className="flex items-center justify-between gap-4 bg-white rounded-xl border border-gray-200 p-4 hover:border-brand-300 transition"
                >
                  <div>
                    <p className="font-bold text-gray-900">
                      参考グレード PSA {m.estimatedGrade ?? "—"} 相当
                      {m.method === "AI" && (
                        <span className="ml-2 text-xs font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">AI</span>
                      )}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">表 {formatRatio(m.frontLR)} · {formatRatio(m.frontTB)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-gray-400">{format(new Date(m.createdAt), "yyyy/MM/dd")}</p>
                    <span className="text-2xl leading-none text-brand-600">›</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <p className="text-xs text-gray-400 text-center leading-relaxed">
          測定結果は参考値であり、PSA等の鑑定会社による公式判定を保証するものではありません。
        </p>
      </main>
      <Footer />
    </div>
  );
}
