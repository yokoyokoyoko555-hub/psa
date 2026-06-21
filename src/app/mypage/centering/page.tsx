export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCustomerSession } from "@/lib/customer-auth";
import { getCenteringAccess, getMyMeasurements } from "@/actions/centering";
import { formatRatio } from "@/lib/centering";
import CustomerHeader from "@/components/CustomerHeader";
import { format } from "date-fns";

export const metadata = { title: "センタリング測定 | トレカビンクス" };

export default async function CenteringPage() {
  const customer = await getCustomerSession();
  if (!customer) redirect("/login");

  const hasAccess = await getCenteringAccess();
  const measurements = hasAccess ? await getMyMeasurements() : [];

  return (
    <div className="min-h-screen bg-gray-50">
      <CustomerHeader title="センタリング測定" />

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {!hasAccess ? (
          <section className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
            <div className="flex flex-col items-center text-center gap-2">
              <div className="w-14 h-14 rounded-full bg-brand-50 flex items-center justify-center text-brand-600 text-2xl">
                ◎
              </div>
              <p className="text-2xl font-bold text-gray-900">
                ¥550<span className="text-sm font-normal text-gray-500"> /月（税込）</span>
              </p>
            </div>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-center gap-2"><span className="text-brand-600">✓</span> カメラでカードの表裏を撮影し、その場でセンタリングを測定</li>
              <li className="flex items-center gap-2"><span className="text-brand-600">✓</span> 測定履歴をマイページに保存</li>
              <li className="flex items-center gap-2"><span className="text-brand-600">✓</span> いつでも解約可能</li>
            </ul>
            <button
              disabled
              className="w-full bg-brand-600 text-white font-bold py-3 rounded-lg opacity-50 cursor-not-allowed"
            >
              加入する（まもなく提供）
            </button>
            <p className="text-xs text-gray-400 text-center leading-relaxed">
              ※ サブスク加入機能は準備中です。<br />
              測定結果は参考値であり、PSA等の鑑定会社による公式判定を保証するものではありません。
            </p>
          </section>
        ) : (
          <>
            <Link
              href="/mypage/centering/measure"
              className="block bg-brand-600 text-white rounded-2xl p-6 hover:bg-brand-700 transition"
            >
              <p className="text-lg font-bold">📷 新しく測定する</p>
              <p className="text-sm text-white/80 mt-1">カードの表裏を撮影してセンタリングを測定します</p>
            </Link>

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
                        </p>
                        <p className="text-sm text-gray-500 mt-1">
                          表 {formatRatio(m.frontLR)} · {formatRatio(m.frontTB)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-gray-400">
                          {format(new Date(m.createdAt), "yyyy/MM/dd")}
                        </p>
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
          </>
        )}
      </main>
    </div>
  );
}
