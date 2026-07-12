export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCustomerSession } from "@/lib/customer-auth";
import { getMeasurement } from "@/actions/centering";
import { formatRatio } from "@/lib/centering";
import CustomerHeader from "@/components/CustomerHeader";
import Footer from "@/components/Footer";
import { format } from "date-fns";

export const metadata = { title: "測定結果 | トレカビンクス" };

function Row({ label, lr, tb }: { label: string; lr: number | null; tb: number | null }) {
  return (
    <div className="border border-gray-200 rounded-xl p-4">
      <p className="text-sm text-gray-500 mb-2">{label}</p>
      {lr === null || tb === null ? (
        <p className="text-gray-400 text-sm">未測定</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-gray-400">左右</p>
            <p className="text-xl font-bold text-gray-900">{formatRatio(lr)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">上下</p>
            <p className="text-xl font-bold text-gray-900">{formatRatio(tb)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default async function MeasurementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const customer = await getCustomerSession();
  if (!customer) redirect("/login");

  const { id } = await params;
  const m = await getMeasurement(id);
  if (!m) redirect("/mypage/centering");

  return (
    <div className="min-h-screen bg-gray-50">
      <CustomerHeader title="測定結果" />

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-5">
        <Link href="/mypage/centering" className="text-sm text-gray-500 hover:text-gray-700">
          ← センタリング測定へ戻る
        </Link>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
          <div className="text-center">
            <p className="text-sm text-gray-500">参考上限グレード</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">
              PSA {m.estimatedGrade ?? "—"} <span className="text-base font-normal text-gray-400">相当</span>
              {m.method === "AI" && (
                <span className="ml-2 align-middle text-xs font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">AI</span>
              )}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {format(new Date(m.createdAt), "yyyy年MM月dd日 HH:mm")}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Row label="表面" lr={m.frontLR} tb={m.frontTB} />
            <Row label="裏面" lr={m.backLR} tb={m.backTB} />
          </div>

          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg p-3 text-xs leading-relaxed">
            ⚠️ 本測定は参考値であり、PSA等の鑑定会社による公式判定を保証するものではありません。表面・角・エッジ・印刷などセンタリング以外の要素は評価していません。
          </div>
        </div>

        <Link href="/apply" className="block bg-brand-600 text-white rounded-2xl p-5 hover:bg-brand-700 transition">
          <p className="font-bold">📨 このカードをPSA鑑定に申し込む</p>
          <p className="text-sm text-white/80 mt-1">トレカビンクスがPSA提出を代行します。センタリングが良ければ高グレードのチャンス。</p>
        </Link>

        <Link
          href="/mypage/centering/measure"
          className="block text-center w-full border-2 border-brand-600 text-brand-700 font-bold py-3 rounded-lg hover:bg-brand-50 transition"
        >
          もう一度測定する
        </Link>
      </main>
      <Footer />
    </div>
  );
}
