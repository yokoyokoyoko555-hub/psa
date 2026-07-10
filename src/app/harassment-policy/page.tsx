import type { ReactNode } from "react";
import CustomerHeader from "@/components/CustomerHeader";
import Footer from "@/components/Footer";

export const metadata = { title: "カスタマーハラスメントポリシー | トレカビンクス" };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pt-4 space-y-3">
      <h2 className="text-lg font-bold text-gray-900 border-b border-gray-200 pb-2">{title}</h2>
      {children}
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="pt-2">
      <h3 className="font-bold text-gray-900 mb-1">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

export default function HarassmentPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <CustomerHeader title="カスタマーハラスメントポリシー" />

      <main className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">カスタマーハラスメントポリシー</h1>
        <p className="text-xs text-gray-400 mb-6">制定日：2026年7月10日</p>

        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6 text-sm text-gray-700 leading-relaxed">
          <Section title="1. 基本方針">
            <p>
              株式会社ツルプルン（以下「当社」といいます。）は、お客様に安心してPSA鑑定受付代行サービスをご利用いただけるよう、公正かつ誠実な対応に努めています。
            </p>
            <p>
              一方で、一部のお客様による社会通念を超える要求や迷惑行為、誹謗中傷、威圧的な言動等は、従業員の人格・尊厳を傷つけ、安全な職場環境を損なうだけでなく、他のお客様へのサービス提供にも重大な支障を及ぼします。
            </p>
            <p>
              当社は、お客様からのご意見・ご要望には真摯に耳を傾け、サービス改善に活かしてまいります。しかし、カスタマーハラスメントに該当すると当社が判断した場合には、本ポリシーに基づき適切に対応いたします。
            </p>
          </Section>

          <Section title="2. カスタマーハラスメントの定義">
            <p>
              当社では、厚生労働省の「カスタマーハラスメント対策企業マニュアル」を参考に、次のような行為をカスタマーハラスメントと判断します。
            </p>
            <p>なお、以下は例示であり、これらに限られるものではありません。</p>
          </Section>

          <Section title="3. 該当する行為">
            <SubSection title="（1）暴言・威圧・人格否定">
              <ul className="list-disc pl-5 space-y-0.5">
                <li>大声による威嚇</li>
                <li>暴言</li>
                <li>侮辱</li>
                <li>人格否定</li>
                <li>名誉毀損となる発言</li>
                <li>差別的発言</li>
                <li>従業員への執拗な叱責</li>
              </ul>
            </SubSection>

            <SubSection title="（2）脅迫・威迫行為">
              <ul className="list-disc pl-5 space-y-0.5">
                <li>暴力行為</li>
                <li>暴力を示唆する発言</li>
                <li>法的措置を不当に利用した威迫</li>
                <li>SNSでの炎上を示唆する脅し</li>
                <li>「店を潰す」「社員を辞めさせる」等の発言</li>
                <li>従業員個人への攻撃</li>
              </ul>
            </SubSection>

            <SubSection title="（3）過度または不当な要求">
              <p>契約・利用規約・法令上の義務を超える以下の要求</p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>無償対応</li>
                <li>特別対応</li>
                <li>優先対応</li>
                <li>過度な値引き</li>
                <li>不当な返金要求</li>
                <li>グレード保証の要求</li>
                <li>PSAの鑑定結果変更要求</li>
                <li>納期保証の要求</li>
                <li>当社に責任のない事項についての補償要求</li>
                <li>PSAが決定したアップチャージの免除要求</li>
              </ul>
            </SubSection>

            <SubSection title="（4）繰り返し・執拗な問い合わせ">
              <ul className="list-disc pl-5 space-y-0.5">
                <li>同一内容の繰り返し</li>
                <li>回答済み事項への執拗な要求</li>
                <li>長時間の電話</li>
                <li>営業時間外の度重なる連絡</li>
                <li>回答期限を不当に短く指定する行為</li>
              </ul>
            </SubSection>

            <SubSection title="（5）SNS・インターネット上での迷惑行為">
              <ul className="list-disc pl-5 space-y-0.5">
                <li>虚偽情報の投稿</li>
                <li>誹謗中傷</li>
                <li>当社とのやり取りの一部のみを切り取り誤認を招く投稿</li>
                <li>従業員個人の実名・写真等の公開</li>
                <li>根拠のない風評被害を目的とした投稿</li>
              </ul>
              <p className="pt-1">なお、事実に基づく正当な口コミや意見表明を妨げるものではありません。</p>
            </SubSection>

            <SubSection title="（6）業務妨害行為">
              <ul className="list-disc pl-5 space-y-0.5">
                <li>長時間の居座り</li>
                <li>退去要請への不応</li>
                <li>店舗・事務所での騒音行為</li>
                <li>他のお客様への迷惑行為</li>
                <li>正常な業務を妨害する行為</li>
              </ul>
            </SubSection>

            <SubSection title="（7）従業員へのハラスメント">
              <ul className="list-disc pl-5 space-y-0.5">
                <li>セクシャルハラスメント</li>
                <li>ストーカー行為</li>
                <li>わいせつな言動</li>
                <li>SNSでの付きまとい</li>
                <li>私的連絡先を聞き出す行為</li>
                <li>無断撮影・録音・録画（法令上認められる場合を除く。）</li>
              </ul>
            </SubSection>
          </Section>

          <Section title="4. PSA鑑定受付代行サービスに関するお願い">
            <p>当社はPSAへの提出を代行する事業者であり、鑑定機関ではありません。</p>
            <p>そのため、以下について当社では決定・変更することはできません。</p>
            <ul className="list-disc pl-5 space-y-0.5">
              <li>鑑定結果・グレード</li>
              <li>鑑定基準</li>
              <li>PSAによるアップチャージ</li>
              <li>PSA側の審査・納期</li>
              <li>PSAの判断による返却方法</li>
              <li>PSAのシステム障害等による遅延</li>
            </ul>
            <p className="pt-1">これらについて当社へ過度な要求や責任追及を行うことはご遠慮ください。</p>
          </Section>

          <Section title="5. 当社の対応">
            <p>カスタマーハラスメントに該当すると判断した場合、当社は状況に応じて次の対応を行います。</p>
            <ul className="list-disc pl-5 space-y-0.5">
              <li>お問い合わせ対応の終了</li>
              <li>電話の終了</li>
              <li>面談の中止</li>
              <li>サービス利用のお断り</li>
              <li>今後のお取引停止</li>
              <li>ご注文の受付拒否</li>
              <li>会員資格の停止または取消し</li>
              <li>必要に応じて警察・弁護士等への相談</li>
              <li>民事・刑事上の法的措置</li>
            </ul>
          </Section>

          <Section title="6. 従業員の保護">
            <p>当社は従業員の安全と尊厳を守るため、</p>
            <ul className="list-disc pl-5 space-y-0.5">
              <li>対応内容の記録</li>
              <li>通話録音</li>
              <li>メール・チャットの保存</li>
              <li>防犯カメラ映像の保存</li>
              <li>必要に応じた第三者機関への相談</li>
            </ul>
            <p className="pt-1">を行う場合があります。</p>
          </Section>

          <Section title="7. お客様へのお願い">
            <p>当社は、お客様との信頼関係を大切にし、誠実なサービス提供に努めてまいります。</p>
            <p>お客様からのご意見・ご要望は、今後のサービス改善につながる貴重なものと考えております。</p>
            <p>すべてのお客様に安心してサービスをご利用いただくため、本ポリシーへのご理解とご協力をお願い申し上げます。</p>
          </Section>

          <p className="pt-4 text-right text-gray-600">株式会社ツルプルン</p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
