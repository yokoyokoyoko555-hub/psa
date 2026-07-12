import { Fragment } from "react";
import Link from "next/link";
import CustomerHeader from "@/components/CustomerHeader";
import Footer from "@/components/Footer";

export const metadata = { title: "申込の流れ | トレカビンクス" };

const SELF_STEPS = [
  "アイテム・サービス選択",
  "アイテム情報・返送先・決済情報入力",
  "オンライン決済",
  "提出予約（店頭持込／郵送）",
];

const PROXY_STEPS = [
  "代理入力の申込・決済",
  "提出予約（店頭持込／郵送）",
  "代理入力（当社スタッフが対応）",
  "マイページで入力内容を確認・決済",
];

const SHARED_STEPS = [
  { icon: "✈️", title: "提出", note: "PSA日本／PSA USへ発送" },
  { icon: "🔍", title: "鑑定", note: "PSAで鑑定" },
  { icon: "🎁", title: "返却", note: "店頭受取／配送" },
];

export default function HowToApplyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <CustomerHeader
        title="申込の流れ"
        actions={
          <Link
            href="/apply"
            className="shrink-0 bg-brand-600 text-white rounded-full px-4 py-1.5 text-sm font-bold hover:bg-brand-700 transition"
          >
            新規申込
          </Link>
        }
      />

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <h1 className="text-xl font-bold text-gray-900 text-center">申込の流れ</h1>

        {/* 自己入力・代理入力の2ルート */}
        <div className="flex flex-col sm:flex-row gap-5 items-stretch">
          {/* 自己入力 */}
          <div className="flex-1 bg-white border-2 border-brand-500 rounded-xl p-5 flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-xl">💻</span>
              <span className="font-bold text-gray-900">自己入力</span>
            </div>
            <p className="text-xs text-gray-500 mt-1 mb-4">ご自身でカード情報を入力したい方に</p>
            <ol className="space-y-3 flex-1">
              {SELF_STEPS.map((step, i) => (
                <li key={step} className="flex gap-2.5">
                  <span className="shrink-0 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center w-[22px] h-[22px]">
                    {i + 1}
                  </span>
                  <span className="text-sm text-gray-800 leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
            <p className="text-xs text-gray-400 mt-3 pt-3 border-t border-gray-100">
              ※ 選択されたサービスごとに入力していただきます。
            </p>
          </div>

          {/* 代理入力 */}
          <div className="flex-1 bg-white border-2 border-gray-300 rounded-xl p-5 flex flex-col relative">
            <span
              className="absolute -top-3 right-3 w-9 h-9 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-xl"
              aria-label="初心者マーク"
            >
              🔰
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xl">🏪</span>
              <span className="font-bold text-gray-900">代理入力</span>
            </div>
            <p className="text-xs text-gray-500 mt-1 mb-4">初めての方・入力が面倒な方に</p>
            <ol className="space-y-3 flex-1">
              {PROXY_STEPS.map((step, i) => (
                <li key={step} className="flex gap-2.5">
                  <span className="shrink-0 rounded-full bg-gray-500 text-white text-xs font-bold flex items-center justify-center w-[22px] h-[22px]">
                    {i + 1}
                  </span>
                  <span className="text-sm text-gray-800 leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
            <p className="text-xs text-gray-400 mt-3 pt-3 border-t border-gray-100">
              ※ 代理入力料金を先にお支払いいただきます。
            </p>
          </div>
        </div>

        {/* 合流 */}
        <div className="flex flex-col items-center text-gray-300">
          <div className="w-px h-4 bg-gray-300" />
          <span className="text-sm leading-none">⌄</span>
        </div>

        {/* 共通フロー */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-start">
            {SHARED_STEPS.map((step, i) => (
              <Fragment key={step.title}>
                <div className="flex-1 min-w-0 text-center">
                  <div className="w-11 h-11 rounded-xl bg-brand-50 flex items-center justify-center text-lg mx-auto mb-2">
                    {step.icon}
                  </div>
                  <p className="text-sm font-bold text-gray-900">{step.title}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">{step.note}</p>
                </div>
                {i < SHARED_STEPS.length - 1 && (
                  <div className="shrink-0 w-5 flex items-center justify-center text-brand-600 font-bold mt-3">→</div>
                )}
              </Fragment>
            ))}
          </div>
        </div>

        {/* 補足 */}
        <div className="bg-gray-100 rounded-xl px-4 py-3 space-y-1.5 text-xs text-gray-500 leading-relaxed">
          <p>
            ※ 提出先は<span className="font-bold text-gray-900">PSA日本</span>／
            <span className="font-bold text-gray-900">PSA US</span>からお選びいただけます。
          </p>
          <p>
            ※ アイテムおよびサービスレベル毎の料金、各種手数料は
            <Link href="/pricing" className="font-bold text-brand-600 hover:underline">
              料金表
            </Link>
            からご確認ください。
          </p>
          <p>
            ※ PSA日本での取り扱い可能なカードについては、
            <a
              href="https://www.psacard.com/ja-JP/support/faq"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-brand-600 hover:underline"
            >
              公式FAQ
            </a>
            をご確認ください。
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
