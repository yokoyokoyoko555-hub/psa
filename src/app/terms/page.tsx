import Link from "next/link";

export const metadata = { title: "利用規約 | トレカビンクス" };

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 px-4 py-3">
        <div className="max-w-6xl mx-auto">
          <Link href="/" className="inline-block hover:opacity-70 transition">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpg" alt="トレカビンクス" className="h-12 w-auto" />
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">利用規約</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5 text-sm text-gray-700 leading-relaxed">
          <p>
            本利用規約（以下「本規約」）は、株式会社ツルプルン（以下「当社」）が運営するトレカビンクス
            PSA鑑定受付代行サービス（以下「本サービス」）の利用条件を定めるものです。
          </p>

          <section>
            <h2 className="font-bold text-gray-900 mb-1">第1条（適用）</h2>
            <p>本規約は、利用者と当社との間の本サービスの利用に関わる一切の関係に適用されます。</p>
          </section>

          <section>
            <h2 className="font-bold text-gray-900 mb-1">第2条（サービス内容）</h2>
            <p>本サービスは、利用者のトレーディングカードのPSA鑑定を当社が代行して受け付けるものです。</p>
          </section>

          <section>
            <h2 className="font-bold text-gray-900 mb-1">第3条（申込・キャンセル）</h2>
            <p>お申込み後のキャンセルはお受けできません。お申込み内容に誤りがないかご確認ください。</p>
          </section>

          <section>
            <h2 className="font-bold text-gray-900 mb-1">第4条（料金・追加請求）</h2>
            <p>
              料金は申込時に表示される金額とします。PSAの鑑定結果により追加料金（Upcharge）が発生した場合、
              登録済みのお支払い方法へ請求いたします。
            </p>
          </section>

          <section>
            <h2 className="font-bold text-gray-900 mb-1">第5条（免責事項）</h2>
            <p>
              PSAのグレード結果について当社は責任を負いません。郵送時の事故、天災等の不可抗力による損害について、
              保険適用範囲を超える部分の責任を負いかねます。
            </p>
          </section>

          <section>
            <h2 className="font-bold text-gray-900 mb-1">第6条（規約の変更）</h2>
            <p>当社は必要と判断した場合、利用者に通知することなく本規約を変更できるものとします。</p>
          </section>

          <p className="text-xs text-gray-400 pt-4">※ 本規約は雛形です。正式な内容に追って差し替えます。</p>
        </div>
      </main>
    </div>
  );
}
