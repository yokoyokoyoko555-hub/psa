import Link from "next/link";

export const metadata = { title: "個人情報保護方針 | トレカビンクス" };

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-1.5">
        <div className="max-w-3xl mx-auto">
          <Link href="/" className="inline-block hover:opacity-70 transition">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpg" alt="トレカビンクス" className="h-10 w-auto" />
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">個人情報保護方針</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5 text-sm text-gray-700 leading-relaxed">
          <p>
            株式会社ツルプルン（以下「当社」）は、トレカビンクス PSA鑑定受付代行サービスにおいて取得する
            個人情報を適切に保護することを社会的責務と考え、以下の方針に基づき個人情報を取り扱います。
          </p>

          <section>
            <h2 className="font-bold text-gray-900 mb-1">1. 取得する情報</h2>
            <p>氏名、住所、電話番号、メールアドレス、お申込み内容、お支払いに関する情報等を取得します。</p>
          </section>

          <section>
            <h2 className="font-bold text-gray-900 mb-1">2. 利用目的</h2>
            <p>本サービスの提供、本人確認、料金請求、お問い合わせ対応、サービス改善のために利用します。</p>
          </section>

          <section>
            <h2 className="font-bold text-gray-900 mb-1">3. 安全管理</h2>
            <p>
              個人情報は暗号化等の適切な安全管理措置を講じて保管します。クレジットカード情報は決済代行会社
              （Stripe）が管理し、当社サーバーには保存しません。
            </p>
          </section>

          <section>
            <h2 className="font-bold text-gray-900 mb-1">4. 第三者提供</h2>
            <p>法令に基づく場合を除き、ご本人の同意なく個人情報を第三者に提供しません。</p>
          </section>

          <section>
            <h2 className="font-bold text-gray-900 mb-1">5. 開示・訂正・削除</h2>
            <p>ご本人からの個人情報の開示・訂正・削除のご請求には、適切に対応します。</p>
          </section>

          <p className="text-xs text-gray-400 pt-4">※ 本方針は雛形です。正式な内容に追って差し替えます。</p>
        </div>
      </main>
    </div>
  );
}
