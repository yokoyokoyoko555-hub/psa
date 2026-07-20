export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCustomerSession } from "@/lib/customer-auth";
import TopPageHeader from "@/components/TopPageHeader";
import TopPageSections from "@/components/TopPageSections";
import Footer from "@/components/Footer";

export default async function Home() {
  // ログイン済みならマイページへ
  const customer = await getCustomerSession();
  if (customer) redirect("/mypage");

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <TopPageHeader />

      {/* アイキャッチ（将来的に画像に差し替え予定） */}
      <div className="border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 py-14 text-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">PSA鑑定始めるならトレカビンクス！</h1>
          <p className="text-sm text-gray-500 mt-3">提出先・アイテム・サービスレベルを選んでオンラインで申込完了</p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/signup"
              className="w-full sm:w-auto bg-brand-600 text-white font-bold px-8 py-3 rounded-lg hover:bg-brand-700 transition"
            >
              無料で新規登録
            </Link>
            <Link
              href="/login"
              className="w-full sm:w-auto border border-gray-300 text-gray-700 font-bold px-8 py-3 rounded-lg hover:bg-gray-50 transition"
            >
              ログイン
            </Link>
          </div>
        </div>
      </div>

      <TopPageSections />
      <Footer />
    </div>
  );
}
