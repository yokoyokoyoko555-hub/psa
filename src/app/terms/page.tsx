import type { ReactNode } from "react";
import CustomerHeader from "@/components/CustomerHeader";

export const metadata = { title: "利用規約 | トレカビンクス" };

function Chapter({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pt-4 space-y-5">
      <h2 className="text-lg font-bold text-gray-900 border-b border-gray-200 pb-2">{title}</h2>
      {children}
    </section>
  );
}

function Article({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="font-bold text-gray-900 mb-1">{title}</h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <CustomerHeader title="利用規約" />

      <main className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">トレカビンクス PSA鑑定代行サービス利用規約</h1>
        <p className="text-xs text-gray-400 mb-6">制定日：2026年7月8日</p>

        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6 text-sm text-gray-700 leading-relaxed">
          <p>
            株式会社ツルプルン（以下「当社」といいます。）は、当社が運営する「トレカビンクス」において提供するPSA鑑定代行サービス（以下「本サービス」といいます。）について、以下のとおり利用規約（以下「本規約」といいます。）を定めます。
          </p>

          <Chapter title="第1章 総則">
            <Article title="第1条（目的）">
              <p>本規約は、本サービスの利用条件及び当社と利用者との権利義務関係を定めることを目的とします。</p>
              <p>利用者は、本規約に同意した上で本サービスを利用するものとします。</p>
            </Article>

            <Article title="第2条（定義）">
              <p>本規約において使用する用語は、次の各号に定めるとおりとします。</p>
              <p>1. 「利用者」とは、本サービスを利用する個人又は法人をいいます。</p>
              <p>2. 「提出品」とは、利用者が鑑定を依頼するカードその他の商品をいいます。</p>
              <p>3. 「PSA」とは、PSA Japan、Collectors Universe Inc.及びその関連会社をいいます。</p>
              <p>4. 「アップチャージ」とは、提出後にPSAが市場価値その他の理由により追加料金を請求することをいいます。</p>
            </Article>
          </Chapter>

          <Chapter title="第2章 利用申込み">
            <Article title="第3条（利用資格）">
              <p>本サービスを利用できる者は、次の各号を満たすものとします。</p>
              <p>1. 日本国内に住所又は送付先を有すること</p>
              <p>2. 本規約に同意していること</p>
              <p>3. 当社が利用を適当と認めた者であること</p>
              <p className="pt-2">当社は、次のいずれかに該当する場合、利用申込みを拒否又は承認を取り消すことができます。</p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>本規約に違反した場合</li>
                <li>虚偽の申告をした場合</li>
                <li>利用料金等の未払いがある場合</li>
                <li>本人確認に応じない場合</li>
                <li>過去に当社サービスの利用停止を受けた場合</li>
                <li>その他当社が不適当と判断した場合</li>
              </ul>
            </Article>

            <Article title="第4条（申込み）">
              <p>利用者は当社所定の方法により申込みを行うものとし、当社が受付を完了した時点で契約が成立します。</p>
            </Article>

            <Article title="第5条（本人確認）">
              <p>当社は、不正利用防止その他必要と判断した場合、本人確認書類その他必要書類の提出を求めることができます。</p>
            </Article>
          </Chapter>

          <Chapter title="第3章 提出品">
            <Article title="第6条（提出品）">
              <p>利用者は提出品について次の事項を保証するものとします。</p>
              <p>1. 正当な所有者であること又は提出する権限を有すること</p>
              <p>2. 偽造品、盗品その他違法な物品ではないこと</p>
              <p>3. 法令に違反する物品ではないこと</p>
              <p>4. 第三者の権利を侵害する物品ではないこと</p>
            </Article>

            <Article title="第7条（提出拒否）">
              <p>当社は次の提出品について受付又は提出を拒否することがあります。</p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>PSAが受付対象外とするもの</li>
                <li>偽造品又はその疑いがあるもの</li>
                <li>著しく損傷しているもの</li>
                <li>法令に違反するもの</li>
                <li>その他当社が不適当と判断したもの</li>
              </ul>
            </Article>
          </Chapter>

          <Chapter title="第4章 利用料金">
            <Article title="第8条（利用料金）">
              <p>利用料金は、当社ウェブサイトその他当社が定める方法により表示する金額とします。</p>
            </Article>

            <Article title="第9条（追加料金）">
              <p>1. PSAによるアップチャージ、送料、保険料、関税その他追加費用が発生した場合は利用者の負担とします。</p>
              <p>2. 提出後、提出品の市場価値その他の事情により、PSAが提出コースの変更、アップチャージその他追加料金を決定した場合、利用者はこれを負担するものとします。</p>
              <p>3. 当社は追加料金を利用者へ通知します。</p>
              <p>4. 当社は追加料金の支払いが確認できるまで提出品の返送を留保することができます。</p>
            </Article>

            <Article title="第10条（料金改定）">
              <p>為替変動、PSA料金改定その他やむを得ない事情により、当社は料金を変更できるものとします。</p>
            </Article>
          </Chapter>

          <Chapter title="第5章 PSA提出">
            <Article title="第11条（提出）">
              <p>当社は提出を代行するものであり、鑑定はPSAが行います。</p>
            </Article>

            <Article title="第12条（PSA規約等）">
              <p>1. 利用者は、本サービスの利用にあたり、PSAが定める利用規約、ガイドラインその他提出条件（以下「PSA規約等」といいます。）が適用されることを承諾するものとします。</p>
              <p>2. PSA規約等の変更に伴い、本サービスの内容又は条件が変更される場合があります。</p>
              <p>3. PSAによる鑑定業務に関する事項について、本規約とPSA規約等に相違がある場合は、PSA規約等を優先します。</p>
              <p>4. 利用者は、PSAが提出品の画像、認証番号、鑑定結果その他の情報をPSA規約等に基づき記録、公表又は利用する場合があることを承諾するものとします。</p>
            </Article>

            <Article title="第13条（鑑定結果）">
              <p>1. PSAによる鑑定結果はPSAが独自の基準により決定します。</p>
              <p>2. 当社は鑑定結果、グレード、ラベル内容、認証結果その他一切について保証又は表明を行いません。</p>
              <p>3. 利用者は鑑定結果について当社へ異議申立てをすることはできません。</p>
            </Article>

            <Article title="第14条（納期）">
              <p>1. PSAが公表する納期は目安であり保証されるものではありません。</p>
              <p>2. PSAの都合その他当社の責めに帰することができない事由による遅延について、当社は責任を負いません。</p>
            </Article>
          </Chapter>

          <Chapter title="第6章 配送・保険">
            <Article title="第15条（配送）">
              <p>1. 利用者から当社への配送中に生じた事故については配送業者の約款によるものとします。</p>
              <p>2. PSAへの輸送及びPSAからの返送についてはPSA規約等によるものとします。</p>
              <p>3. 当社から利用者への返送については配送業者の約款によるものとします。</p>
            </Article>

            <Article title="第16条（補償）">
              <p>提出品の紛失又は損傷については、配送業者、PSA又は保険会社の定める補償内容に従うものとし、当社に故意又は重大な過失がある場合を除き、当社は責任を負いません。</p>
            </Article>
          </Chapter>

          <Chapter title="第7章 キャンセル">
            <Article title="第17条（キャンセル）">
              <p>1. PSAへ発送後はいかなる理由であってもキャンセルはできません。</p>
              <p>2. 当社又はPSAにおいて既に発生した費用は返金いたしません。</p>
            </Article>
          </Chapter>

          <Chapter title="第8章 保管">
            <Article title="第18条（保管及び処分）">
              <p>1. 当社は鑑定完了後、利用者へ返送又は受取案内を行います。</p>
              <p>2. 利用者が返送又は受取に応じない場合、当社は保管料を請求できるものとします。</p>
              <p>3. 当社からの通知後1年間経過しても受領されない場合は、利用者が提出品の所有権を放棄したものとみなし、当社は法令の範囲内で処分その他適切な方法により対応できるものとします。</p>
            </Article>
          </Chapter>

          <Chapter title="第9章 禁止事項">
            <Article title="第19条（禁止事項）">
              <p>利用者は次の行為を行ってはなりません。</p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>虚偽申告</li>
                <li>他人名義による申込み</li>
                <li>偽造品又は違法物品の提出</li>
                <li>当社又は第三者への迷惑行為</li>
                <li>暴言、脅迫、威力業務妨害</li>
                <li>不正決済</li>
                <li>法令違反</li>
                <li>その他当社が不適当と判断する行為</li>
              </ul>
            </Article>
          </Chapter>

          <Chapter title="第10章 免責">
            <Article title="第20条（免責）">
              <p>1. 当社は、故意又は重大な過失がある場合を除き、本サービスに関して利用者に生じた損害について責任を負いません。</p>
              <p>2. PSAによる鑑定結果、ラベル内容、真贋判定、グレードその他鑑定に関する事項について当社は責任を負いません。</p>
              <p>3. 当社は、PSA、配送会社、税関その他第三者の行為に起因する損害について責任を負いません。</p>
            </Article>

            <Article title="第21条（不可抗力）">
              <p>天災、火災、感染症、戦争、輸送停止、システム障害、停電、政府の規制その他当社の合理的支配を超える事由により生じた損害について、当社は責任を負いません。</p>
            </Article>
          </Chapter>

          <Chapter title="第11章 サービス停止">
            <Article title="第22条（サービス停止）">
              <p>当社は、システム保守、障害、災害その他運営上必要と判断した場合、本サービスを一時停止又は終了することがあります。</p>
            </Article>
          </Chapter>

          <Chapter title="第12章 個人情報">
            <Article title="第23条（個人情報）">
              <p>当社は利用者の個人情報を当社プライバシーポリシーに従い適切に取り扱います。</p>
            </Article>
          </Chapter>

          <Chapter title="第13章 反社会的勢力">
            <Article title="第24条（反社会的勢力の排除）">
              <p>利用者は、自ら又は関係者が反社会的勢力に該当しないことを表明保証するものとします。</p>
              <p>当社は、利用者が反社会的勢力に該当すると判断した場合、催告なく本サービスの利用を停止又は契約を解除できるものとします。</p>
            </Article>
          </Chapter>

          <Chapter title="第14章 一般条項">
            <Article title="第25条（通知）">
              <p>当社から利用者への通知は、電子メール、当社ウェブサイトへの掲載その他当社が適当と認める方法により行います。</p>
            </Article>

            <Article title="第26条（権利義務の譲渡禁止）">
              <p>利用者は、当社の書面による承諾なく、本規約上の権利又は義務を第三者へ譲渡し、又は担保に供してはなりません。</p>
            </Article>

            <Article title="第27条（分離可能性）">
              <p>本規約の一部が法令等により無効又は執行不能と判断された場合であっても、その他の条項は引き続き有効に存続するものとします。</p>
            </Article>

            <Article title="第28条（規約変更）">
              <p>当社は必要に応じて本規約を変更することができます。</p>
              <p>変更後の規約は、当社ウェブサイトその他当社が適当と認める方法で公表した時点から効力を生じるものとします。</p>
            </Article>

            <Article title="第29条（準拠法）">
              <p>本規約は日本法を準拠法とします。</p>
            </Article>

            <Article title="第30条（合意管轄）">
              <p>本規約又は本サービスに関して紛争が生じた場合は、東京地方裁判所を第一審の専属的合意管轄裁判所とします。</p>
            </Article>
          </Chapter>
        </div>
      </main>
    </div>
  );
}
