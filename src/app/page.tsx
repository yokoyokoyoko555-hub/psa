import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-900 to-blue-700 flex flex-col items-center justify-center text-white px-4">
      <div className="max-w-2xl w-full text-center">
        <h1 className="text-4xl font-bold mb-4">トレカビンクス</h1>
        <p className="text-xl text-blue-200 mb-2">PSA鑑定受付代行サービス</p>
        <p className="text-blue-300 mb-12">
          大切なカードのPSA鑑定を、安心・確実にお手伝いします。
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/apply"
            className="bg-yellow-400 text-blue-900 font-bold px-8 py-4 rounded-xl text-lg hover:bg-yellow-300 transition"
          >
            PSA申込を始める
          </Link>
          <Link
            href="/login"
            className="border-2 border-white text-white font-bold px-8 py-4 rounded-xl text-lg hover:bg-white hover:text-blue-900 transition"
          >
            マイページログイン
          </Link>
        </div>
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
          {[
            { title: "カード単位で管理", desc: "QRコードで1枚1枚の状況をリアルタイム追跡" },
            { title: "安全な決済", desc: "Stripe決済。カード情報はStripeが管理し当社サーバーに保存しません" },
            { title: "Upcharge対応", desc: "PSAからの追加請求も自動通知・自動決済で対応" },
          ].map((item) => (
            <div key={item.title} className="bg-white/10 rounded-xl p-6 backdrop-blur-sm">
              <h3 className="font-bold text-lg mb-2">{item.title}</h3>
              <p className="text-blue-200 text-sm">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
