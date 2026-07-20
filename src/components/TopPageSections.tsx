import Link from "next/link";

// トップページ（未ログイン時）のLPセクション。ヘッダー（TopPageHeader）とアイキャッチの下に表示する。
// 実績・数値などコード上で裏付けられない訴求文言は使わない。
const FEATURES = [
  { icon: "🌏", title: "PSA日本・PSA US両対応", text: "提出先を選んで、国内・海外どちらのPSA鑑定にもお申込みいただけます。" },
  { icon: "⌨️", title: "自己入力・代理入力から選べる", text: "ご自身で入力する自己入力、当社スタッフが代行する代理入力、どちらもお選びいただけます。" },
  { icon: "💳", title: "オンライン決済に対応", text: "お申込みからお支払いまでオンラインで完結。カードのお預けは店頭持込・郵送から選べます。" },
  { icon: "💴", title: "料金は税込・事前確認OK", text: "鑑定料・送料・保険料・事務手数料まで、すべて税込価格を事前にご確認いただけます。" },
];

const STEPS = [
  { title: "お申込み・お支払い", text: "提出先・アイテム・サービスレベルを選び、オンライン決済まで完了" },
  { title: "カードのお預け", text: "店頭持込または郵送予定日をご予約のうえ、カードをお預けください" },
  { title: "鑑定・返却", text: "PSAでの鑑定後、店頭受取または配送でお手元にお戻しします" },
];

export default function TopPageSections() {
  return (
    <div className="bg-gray-50 border-t border-gray-100">
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-10">
        {/* 選ばれる理由 */}
        <section>
          <h2 className="text-lg font-bold text-gray-900 text-center mb-6">選ばれる理由</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="text-2xl mb-2">{f.icon}</div>
                <p className="font-bold text-gray-900 mb-1">{f.title}</p>
                <p className="text-sm text-gray-500 leading-relaxed">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 申込の流れ */}
        <section>
          <h2 className="text-lg font-bold text-gray-900 text-center mb-6">申込の流れ</h2>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <ol className="flex flex-col sm:flex-row gap-4 sm:gap-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex-1 flex sm:flex-col gap-3 sm:gap-2 sm:text-center">
                  <span className="shrink-0 w-7 h-7 rounded-full bg-brand-600 text-white text-sm font-bold flex items-center justify-center sm:mx-auto">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-bold text-gray-900 text-sm">{s.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <p className="text-center mt-3">
            <Link href="/how-to-apply" className="text-sm font-bold text-brand-600 hover:underline">
              申込の流れを詳しく見る →
            </Link>
          </p>
        </section>

        {/* 料金 */}
        <section>
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
            <h2 className="text-lg font-bold text-gray-900 mb-2">料金について</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              鑑定料に加えて、送料・保険料、事務手数料がかかります（代理入力の場合は代理入力料金も）。
              表示価格はすべて消費税込みです。
            </p>
            <Link
              href="/pricing"
              className="inline-block mt-4 bg-brand-600 text-white font-bold px-6 py-2.5 rounded-lg hover:bg-brand-700 transition text-sm"
            >
              料金表を見る
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
