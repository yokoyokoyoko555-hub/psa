import type { ReactNode } from "react";
import CustomerHeader from "@/components/CustomerHeader";
import Footer from "@/components/Footer";

export const metadata = { title: "個人情報保護方針 | トレカビンクス" };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-bold text-gray-900 mb-1">{title}</h2>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <CustomerHeader title="個人情報保護方針" />

      <main className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">個人情報保護方針</h1>
        <p className="text-xs text-gray-400 mb-6">最終改定日: 2026年6月26日（叩き台 / 公開前に法務確認）</p>

        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5 text-sm text-gray-700 leading-relaxed">
          <p>
            株式会社ツルプルン（以下「当社」といいます）は、トレカビンクス PSA鑑定受付代行サービス（以下「本サービス」といいます）の提供にあたり、
            利用者の個人情報を適切に取り扱うため、本個人情報保護方針（以下「本方針」といいます）を定めます。
          </p>

          <Section title="1. 取得する情報">
            <p>当社は、本サービスの提供に必要な範囲で以下の情報を取得します。</p>
            <p>・氏名、住所、電話番号、メールアドレス等の連絡先情報</p>
            <p>・申込内容（カード明細、申告価格、サービス選択等）</p>
            <p>・決済に関する情報（カード番号・セキュリティコードは決済代行会社（Stripe）が取り扱い、当社は保持しません）</p>
            <p>・アクセスログ、操作履歴、Cookie等の利用情報</p>
          </Section>

          <Section title="2. 利用目的">
            <p>・本サービスの提供、申込受付、カードの預かり・提出・返却、料金の決済</p>
            <p>・本人確認、お問い合わせ対応、重要なお知らせの通知</p>
            <p>・不正利用の防止、サービスの品質向上・改善</p>
            <p>・法令に基づく対応</p>
          </Section>

          <Section title="3. 第三者提供">
            <p>当社は、法令に基づく場合を除き、利用者の同意なく個人情報を第三者に提供しません。ただし、本サービスの提供に必要な範囲で、PSA（鑑定機関）、配送事業者、決済代行会社等へ必要な情報を提供します。</p>
          </Section>

          <Section title="4. 業務委託">
            <p>当社は、利用目的の達成に必要な範囲で個人情報の取扱いを外部に委託する場合があります。この場合、委託先に対して適切な監督を行います。</p>
          </Section>

          <Section title="5. 安全管理措置">
            <p>当社は、個人情報の漏えい・滅失・毀損の防止その他安全管理のために必要かつ適切な措置を講じます。氏名・住所等の重要情報は暗号化して保存し、パスワードはハッシュ化して管理します。</p>
          </Section>

          <Section title="6. Cookie等の利用">
            <p>本サービスは、ログイン状態の維持やサービス改善のためにCookie等を利用します。利用者はブラウザ設定によりCookieを無効化できますが、一部機能が利用できない場合があります。</p>
          </Section>

          <Section title="7. 保有期間">
            <p>個人情報は、利用目的の達成に必要な期間および法令で定める期間保有し、不要となった場合は適切に消去します。</p>
          </Section>

          <Section title="8. 開示・訂正・削除等">
            <p>利用者は、自己の個人情報について、開示・訂正・利用停止・削除等を請求できます。請求は下記窓口までご連絡ください。本人確認のうえ、法令に従い対応します。</p>
          </Section>

          <Section title="9. 方針の変更">
            <p>当社は、本方針を必要に応じて変更することがあります。重要な変更は本サービス上で告知します。</p>
          </Section>

          <Section title="10. お問い合わせ窓口">
            <p>個人情報の取扱いに関するお問い合わせは、当社所定の窓口（メール等）までご連絡ください。</p>
          </Section>

          <p className="text-xs text-gray-400 pt-4">※ 本方針は叩き台です。事業者情報・窓口・保有期間等を確定し、公開前に弁護士等による確認を行ってください。</p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
