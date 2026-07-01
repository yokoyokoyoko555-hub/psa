# DECISIONS — 設計判断記録（ADR）

重要な設計判断を時系列で記録する。Codex/Claude が背景を理解し、過去の決定を蒸し返さないための「決定ログ」。

## 運用ルール
- **重要な設計判断をしたら、新しいADRを末尾に追記する**（番号は連番、日付・状態・文脈・決定・影響を埋める）。
- 「重要」の目安: スキーマ/認証/決済/料金/デプロイ/依存追加/テスト方針 など、後から覆すとコストが高いもの。
- 過去の決定を変える場合は、新ADRを起こし、旧ADRの状態を `Superseded by ADR-XXXX` に更新（**過去ADRは消さない**）。
- 些末な実装詳細は対象外（コード/コメントで足りるもの）。

## テンプレート
```
## ADR-XXXX: タイトル
- 日付: YYYY-MM-DD
- 状態: Proposed | Accepted | Superseded by ADR-YYYY | Deprecated
- 文脈: なぜ判断が必要か
- 決定: 何を決めたか
- 影響: 結果・トレードオフ・関連ファイル
```

---

## ADR-0001: 認証を管理者と顧客で二系統に分離
- 日付: 2026-06-17
- 状態: Accepted
- 文脈: 管理者は堅牢なRBACが必要、顧客は軽量で長期セッションが望ましい。
- 決定: 管理者は NextAuth v5 (JWT, Credentials)。顧客は自前cookieセッション（`CustomerSession`テーブル, 30日）。
- 影響: `lib/auth.ts` と `lib/customer-auth.ts` の2実装。middlewareでは認可しない（§ADR-0005）。

## ADR-0002: PIIはAES-256-GCMでアプリ層暗号化
- 日付: 2026-06-17
- 状態: Accepted
- 文脈: 氏名・住所・電話等の個人情報をDB漏洩時にも保護したい。
- 決定: `lib/crypto.ts` で `*Encrypted` 列に暗号化保存。キーは `ENCRYPTION_KEY`(32byte hex) env。`email`/`postalCode` は検索性のため平文。
- 影響: 顧客データ読取時は必ず `decrypt`。キーをローテーションすると既存データ復号不可。

## ADR-0003: Prisma v7 + driver adapter (@prisma/adapter-pg)
- 日付: 2026-06-17
- 状態: Accepted
- 文脈: Prisma v7 の client engine は driver adapter を要求。
- 決定: `PrismaPg` アダプタで接続。`prisma.config.js` に `datasource.url`（CLI用）、`schema.prisma` には `url` を書かない（v7で不可）。Nodeは 22.12+ 必須 → `.node-version=22.15.0`。
- 影響: `lib/prisma.ts`/`seed.ts` でアダプタ生成。CLIもconfig経由でDB接続。

## ADR-0004: スキーマ同期は `prisma db push`（migrate未運用）
- 日付: 2026-06-17
- 状態: Accepted（将来見直し候補）
- 文脈: 初期は迅速さ優先でマイグレーションファイルを持たなかった。`migrate deploy` は migrations 不在で no-op。
- 決定: `npm start` を `prisma db push --accept-data-loss && next start` とし、起動時にスキーマ同期。
- 影響: 破壊的スキーマ変更はデータ損失リスクあり。本番データが増えたら `prisma migrate` への移行を検討（その際は新ADR）。

## ADR-0005: middlewareはセキュリティヘッダのみ（認可しない）
- 日付: 2026-06-17
- 状態: Accepted
- 文脈: Next.js middleware は Edge ランタイムで Node `crypto`/Prisma を使えず、`auth()` 取り込みで起動クラッシュした。
- 決定: middlewareはヘッダ付与のみ。認可は各ページ/レイアウト(`admin/layout.tsx`)・Server Action側で実施。
- 影響: 認可ロジックを各所に持つ。新規保護ルートはレイアウト/Actionでの認可を忘れない。

## ADR-0006: 起動コマンドは nixpacks.toml / package.json 側を正とする
- 日付: 2026-06-17
- 状態: Accepted
- 文脈: Railway の Custom Start Command / `railway.json` の `startCommand` が `prisma migrate deploy && npm start` を指し、デプロイで混乱した。
- 決定: 実効の起動は `npm start`（= `db push && next start`）に集約。`db push` を npm start 内に入れ、起動コマンドの上書きに依存しない構成にした。
- 影響: `railway.json` の `startCommand` は旧記述が残存（migrate deployはno-opのため実害なし）。整理タスクは §TASKS。設定を触る際は本ADRを参照。

## ADR-0007: 環境変数依存モジュールの遅延初期化
- 日付: 2026-06-17
- 状態: Accepted
- 文脈: Stripe/S3/crypto をモジュールトップで初期化すると、ビルド時に env 不在でクラッシュした。
- 決定: `getStripe()`/`getS3()`/`crypto.getKey()` 形で初回呼び出し時に初期化。DB/auth利用ページは `export const dynamic = "force-dynamic"`。
- 影響: env未設定でもビルド・起動可能。該当機能は実行時にenvが必要。

## ADR-0008: 管理ロールは ADMIN / STAFF の2種に集約
- 日付: 2026-06-17
- 状態: Accepted
- 文脈: ACCOUNTING(経理) ロールは権限設計が中途半端だった。
- 決定: 運用は ADMIN（全機能）/ STAFF（料金設定以外）の2ロール。seedから経理ユーザーを削除。`UserRole.ACCOUNTING` enumは互換のため残置（未使用）。
- 影響: 認可は `requireAdmin`(ADMINのみ=料金設定) / `requireAdminOrStaff`。経理専用機能が必要になれば新ADRで再設計。

## ADR-0009: admin認可をレイアウトで行い /admin/login を除外
- 日付: 2026-06-18
- 状態: Accepted（ADR-0005 を補完）
- 文脈: ADR-0005 で認可を `admin/layout.tsx` に移したが、レイアウトは `/admin/login` も配下に含むため、未ログイン時に login→login の無限リダイレクト（ERR_TOO_MANY_REDIRECTS）が発生した。
- 決定: middleware で `x-pathname` ヘッダに現在パスを載せ、`admin/layout.tsx` は `pathname === "/admin/login"` のときサイドバー無しで素通し（認可スキップ）。それ以外は従来通り未ログインを `/admin/login` へ。
- 影響: 認可判定はレイアウトのパス分岐に依存。新規の「認証前に見せる管理画面」を足す場合は同様に除外条件へ追加すること。

## ADR-0010: サービスレベルをPSA 9段階に拡張＋申告価格上限を導入
- 日付: 2026-06-18
- 状態: Accepted
- 文脈: 顧客提示のPSA料金表（9段階）と申告価格上限に合わせる必要があった。
- 決定:
  - `ServiceLevel` enum に WALK_THROUGH / PREMIUM_1/2/3/5/10 を追加（旧 `VALUE` は削除せず未使用で残置＝db pushのenum削除トラブル回避、ACCOUNTERと同方針）。
  - `ServicePrice` に `maxDeclaredValue Int?`（null=上限なし）を追加。
  - `pricePerCard` = 顧客請求額（料金表の値）。`agencyFee` は別フィールドとして保持し seed では 0（管理画面→設定で運用調整）。
  - 申込時、選択レベルの `maxDeclaredValue` を超える申告価格のカードは `createApplication` で弾く（サーバ側バリデーション）。
- 影響: seed は service_prices を deleteMany→createMany で9行に再生成。料金額・上限は確定値（ユーザー提供）。料金計算式（税10%・psaCost=価格×80%）は不変。

## ADR-0011: 申込を 入力経路×提出先 の2×2で分岐
- 日付: 2026-06-19
- 状態: Accepted（実装中・段階的）
- 文脈: 申込を「①自身+PSA日本 ②自身+PSA US ③店舗+PSA日本 ④店舗+PSA US」の4分岐にしたい。
- 決定:
  - `ServiceRegion`(PSA_JP/PSA_US) と `ApplicationSource`(CUSTOMER/STORE) を追加。`Application` に両方を保持。
  - 料金は地域別。`ServicePrice` を `@@unique([serviceLevel, region])` に変更し、レベル×地域で価格・手数料・上限を保持。**全項目を管理画面で編集可（可変式）**。
  - 手数料は **STORE（当社入力）のみ加算**、CUSTOMER（顧客入力）は0。`calculateFees({ region, applyAgencyFee })` で制御。
  - 顧客フロー `/apply` は source=CUSTOMER。提出先(JP/US)をサービス選択ステップで選ぶ。
  - 当社入力(STORE)は **管理画面の「代理申込」**で行い、顧客マイページに反映（同一 Application テーブル）。※代理申込UIは次フェーズ。
  - PSA_US の料金は暫定で JP と同額（管理画面で調整）。
- 影響: `VALUE` 同様 enum は追加方針。seed は 9レベル×2地域=18行。代理申込ページ実装が残タスク。

## ADR-0012: センタリング測定ツール（月額550円サブスク・オンデバイス測定）
- 日付: 2026-06-21
- 状態: Accepted（設計確定・未実装）
- 文脈: 新機能として、カメラでカード表裏を撮影しセンタリング（余白比率）を測定するツールを追加し、月額550円の継続課金で提供したい（参考: AXCI）。継続課金は既存システム未実装。設計詳細は [CENTERING_TOOL.md](CENTERING_TOOL.md)。
- 決定:
  - **測定はオンデバイス（ブラウザ内CV）＋手動ガイド補正**。撮影画像はサーバ送信せず端末内で処理し、`CenteringMeasurement` には**数値結果のみ**保存（画像はS3保存しない）。
  - **継続課金は Stripe Checkout(subscription)＋Customer Portal** を採用。自前の加入/解約UIは作らない。新モデル `Subscription`（汎用）＋ `enum SubscriptionStatus` を追加。利用可否は `requireActiveSubscription()`（status∈{ACTIVE,TRIALING} かつ currentPeriodEnd>now）でページ/Action側ゲート（[ADR-0005] 準拠）。
  - webhook は subscription/invoice 系イベントを**追記**（既存 `payment_intent.*` 分岐は不変）。
  - 結果は**参考値**であり鑑定会社の判定を保証しない旨を必ず明示（自社がPSA代行業者のため）。
  - 段階リリース: Phase0=課金基盤＋導線 / Phase1=撮影＋測定 / Phase2=精度向上・価格参考（任意）。
- 影響: `prisma/schema.prisma` に2モデル＋1enum追加（db pushで反映＝データ損失なし）。env `STRIPE_CENTERING_PRICE_ID` 追加。Stripeで継続Price作成・Portal有効化・Webリイベント追加の人手作業が前提。将来MLによる内枠自動検出へ拡張する場合は新ADR。

## ADR-0013: センタリングを2層化（ライト無料／AI有料）＋PSA申込ファネル化
- 日付: 2026-06-21
- 状態: Accepted（設計確定・実装中）。ADR-0012 を補完（課金対象を変更）。
- 文脈: ツールの**本丸はPSA鑑定代行（本業）への送客**。集客の入口を広げ、体験価値で上位課金に誘導したい。AI検出のエンジンは端末内（CV→ML）とし、APIの限界費用ゼロを確認済み。
- 決定:
  - **2層構成**: ①ライト（手動4隅・透視補正）=**無料**（ログインのみ）/ ②AI（端末内で枠を自動検出し瞬時に推定）=**¥550/月サブスク**（上位互換）。AIが外したら手動ハンドルで微調整に落とせる（シームレス）。
  - **AIエンジンは端末内**（classical CV → 必要に応じ TF.js/ONNX のML）。画像はサーバ送信せず端末内処理（ADR-0012方針維持）。**外部AI推論API原価はゼロ**。
  - **課金ゲートを変更**: 「ツール全体」から「**AIの自動検出機能のみ** `requireActiveSubscription`」へ。手動測定は全ログインユーザーに開放。
  - **PSA申込ファネル**: 測定結果画面に「このカードをPSA鑑定に申し込む」CTA（`/apply` へ）を設置。本丸事業への導線を主目的に据える。
  - 価格は限界費用ゼロのため**価値・ファネル設計優先**でライト無料／AI¥550に確定（ADR-0012の「ツール=¥550」を本ADRで上書き）。
  - `CenteringMeasurement` に `method`（MANUAL / AI）を追加し測定手段を記録。
- 影響: `/mypage/centering` のゲート再構成（手動開放・AIのみ課金）。schema に `method` 追加（db push）。Stripe継続Price（¥550）作成は引き続き要（Phase 0）。AIの自動検出実装（CVライブラリ選定: OpenCV.js 等）は別実装。`CENTERING_DEV_UNLOCK=true` は「AI機能の開発開放」用に意味を引き継ぐ。

## ADR-0014: カード提出予約を申込起点のリスト型に再設計＋店頭提示レシート
- 日付: 2026-06-23
- 状態: Accepted（設計確定・未実装）。詳細は [SUBMISSION_BOOKING.md](SUBMISSION_BOOKING.md)。
- 文脈: 決済後の提出予約がカレンダー起点で「どの申込の予約か」が分かりにくい。予約完了後の着地、既存予約の管理、店頭持込時の現物照合の手段が不足。
- 決定:
  - 予約トップを**支払済み申込のリスト**に変更（申込番号・枚数・金額・予約状態）。カレンダーは選択した申込専用に従属表示（単一申込の日時/方法選択）。
  - 予約保存後は**予約詳細ページ `/mypage/submission-booking/[applicationId]`** へ遷移（完了画面兼用）。一覧＋詳細で変更・キャンセル。
  - 店頭提示は**QRなしのレシート**とし、**カード明細リスト**を表示して店員が現物と面前照合する用途に最適化（QRは現物照合にならないため不採用）。
  - スキーマは**変更しない**（予約は `SubmissionBooking.applicationId @unique` で既に申込単位。カード明細は `Card` から取得）。既存Actions（`upsertSubmissionBooking`/`cancelSubmissionBooking`）を流用。
  - 段階: Phase1=リスト化＋日時選択＋詳細遷移、Phase2=詳細を店頭提示レシート化（明細・印刷対応）。QRスキャン受領は本スコープ外（将来別ADR）。
- 影響: `/mypage/submission-booking` のUI刷新、新規ルート2つ（`[applicationId]` / `[applicationId]/edit`）、`BookingCalendar` の簡素化。管理側・決済・ステータス遷移は不変。

## ADR-0015: 料金体系リニューアル（PSA日本）— 送料保険マトリクス＋代理入力料金＋事務手数料
- 日付: 2026-06-23
- 状態: Accepted（設計確定・実装前。要確認2点は [PRICING.md](PRICING.md) §9）。ADR-0010/0011 を補完。
- 文脈: 実運用の料金体系に合わせ、管理画面の料金設定と顧客画面を更新。鑑定料は現状維持で、送料・保険を「申告価格帯×枚数帯」のマトリクス化し、代理入力料金・事務手数料を追加。対象は PSA日本のみ。
- 決定:
  - **鑑定料は不変**（`ServicePrice.pricePerCard`）。
  - **送料・保険は合算1マトリクス** `ShippingInsuranceRate`（region×申告合計帯×枚数帯→金額、26+は¥/枚加算）。PSA_JP では既存 `ShippingRule`/`InsuranceRule` を置換。顧客表示は「送料・保険料」1行。
  - **代理入力料金 = ¥/枚・サービスレベルごと**（既存 `agencyFee` を流用・UI改称、STORE時のみ加算）。
  - **事務手数料 = ¥/申込・サービスレベルごと**（`ServicePrice.handlingFee` 新設）。申込=1サービスレベル。
  - 範囲は **PSA_JP のみ**。US は据え置き。税10%・ステータス遷移は不変。
- 影響: schema に `ServicePrice.handlingFee` 追加＋`ShippingInsuranceRate` 新規（db push）。`fee-calculator`/seed/管理料金設定UI/顧客内訳の改修。`FeeBreakdown` に `handlingFee`、送料保険は合算行に。26+加算式・店頭受取時の扱いは PRICING.md §9 で確定後に実装。
- 補足(後日): 代理入力料金・事務手数料は**リージョン別の一律額**（`PricingSetting`(id=region)）に変更。`ServicePrice.cost`(原価)追加。送料保険マトリクスはリージョン別（JP/USそれぞれ1セット、未投入は従来ロジック）。US顧客表示はUSD（`lib/currency`）。

## ADR-0016: 新規獲得キャンペーン割引（鑑定料以外・期間自動適用）
- 日付: 2026-06-24
- 状態: Accepted（実装中）。料金変更のためユーザー承認済み。
- 文脈: 新規申込獲得のため、期間限定で「半額/無料」等の割引を出したい。
- 決定:
  - **割引対象は「鑑定料以外」**（代理入力料金＋送料・保険＋事務手数料の合計）。鑑定料(原価あり)は割引しない。
  - **割引方式は PERCENT(%) と FIXED(固定額) の両対応**（`Campaign.discountType`/`value`）。割引は対象ベースを上限にクランプ（マイナスにしない）。税は割引後に計算。
  - **期間中に自動適用**（`startAt`〜`endAt`、`isActive`）。クーポンコードは将来。
  - **対象者は新規(初回申込)限定／全員 を切替**（`newCustomerOnly`）。新規=当該顧客の非DRAFT/非CANCELLED申込が0件。
  - リージョン別運用可（`Campaign.region` null=全リージョン。FIXEDは通貨に注意）。
  - 適用キャンペーンは「有効・期間内・リージョン一致・対象者条件一致」のうち1件（`startAt` 新しい順で先頭）。
  - `FeeBreakdown` に `discountAmount`/`campaignName`、`Application` に `discountAmount`/`campaignName` を追加し記録・表示。
- 影響: `Campaign` モデル＋enum新規、`Application` に2列追加（db push）。`calculateFees` に `customerId?`（新規判定用）を追加。管理画面にキャンペーン管理、顧客内訳に「キャンペーン割引」行。

## ADR-0017: 送料・保険の無料化しきい値（N枚以上で0円・リージョン別）
- 日付: 2026-06-26 / 状態: Accepted（実装済）
- 決定: `PricingSetting.freeShipInsQty`（リージョン別、0=無効）を追加。`calculateFees` で `cardCount >= freeShipInsQty(>0)` のとき送料・保険を0円化。管理画面の一律料金セクションで設定。

## ADR-0018: メール文面のテンプレート管理化
- 日付: 2026-06-26 / 状態: Accepted（基盤実装済・トリガ順次追加）
- 決定: `MailTemplate`(key/subject/bodyHtml/enabled) を新設。`mailer.sendTemplate(key,to,vars)` が `{{var}}` を差込んで送信（SMTP未設定/無効/失敗時は無送信）。管理画面で編集。seedで初期テンプレ投入。トリガ: 申込受付(決済確定)・代理入力完了。今後: グレード確定・返却完了・Upcharge等を順次 `sendTemplate` 化。

## ADR-0019: カード名称マスタ（手入力蓄積→サブミッション時サジェスト）
- 日付: 2026-06-26 / 状態: Accepted（実装済）
- 決定: `CardNameMaster` を新設。管理画面 `/admin/card-masters` で手入力CRUD・検索。代理入力(StoreInputForm)のカード名入力に `<datalist>` でサジェスト。顧客入力の誤りはマスタを正とする運用。

## ADR-0020: 代理入力の先払い化（フロー刷新）
- 日付: 2026-06-26（更新 2026-06-28）/ 状態: **段階1〜3 実装済 / 段階4（差額請求）は次フェーズ**。詳細は [PROXY_PREPAY.md](PROXY_PREPAY.md)。ADR-0011/0014 の代理フローを置換。
- 実装メモ（2026-06-28 段階2＋3）: `createStoreRequest` を「サービスレベル＋枚数→概算(枚数×鑑定料＋税)を先払い」に拡張し PaymentIntent の `clientSecret` を返却、`confirmStorePrepayPayment` で確定（status=DRAFT 維持・カードはスタッフが後入力）。決済UIは共有 `components/StripeCardPayment.tsx`（ApplyForm から切り出し）。`Application` に `prepaidAmount`/`estimatedCardCount` 追加（db push）。予約ゲートは `submission-booking.ts` と予約ページ2枚で「SUCCEEDED な決済あり」を全 source 共通に統一し、旧 STORE 特例（未払いでも予約可）を撤去。段階4（最終料金確定→差額追加請求・完了メール、最終<先払い時の返金/充当）は未実装。
- 決定:
  - 代理申込を「**サービスレベル＋カード枚数 入力 → 概算(枚数×鑑定料)を先に決済**」に変更。決済後にカードの**持込/配送を予約**（現行「支払い前に予約」は廃止＝一本化）。
  - 店舗到着→staffが明細入力→最終料金確定→**差額を追加請求**（Upchargeを流用 or 専用課金。送料・保険・事務手数料・代理入力料金差分を含む）。
  - **代理入力料金は「カードの種類数 × 手数料」**（同一カードは何枚でも1種）。種類数はstaff入力後に確定。`calculateFees` に種類数ベースの代理料金を導入。
  - 送料・保険は申告価格が必要なため**差額側にのせる**。返金が必要なケース（最終<先払い）の扱いは実装時に確定。
- 影響: `StoreRequestForm` を「枚数入力＋先払い決済(Stripe)」に作り替え、提出予約ゲートを支払い後に統一、`submitStoreInput` に差額請求、fee-calculator に種類数代理料金。新規Stripe決済サーフェスのため**反復テスト前提で別実装**。


## ADR-0021: 管理画面の申込単位化（カード管理廃止・PSA提出グループを申込単位へ）
- 日付: 2026-07-01 / 状態: 実装済。
- 背景: 従来はカード単位（`Card` 起点）で status/grade/upcharge/PSA提出グループを操作していたが、運用実態（申込＝カードのまとまりを複数まとめて1つのPSAサブミッションへ提出）に合わず煩雑だった。
- 決定:
  - **申込管理は自己入力(source=CUSTOMER)のみ表示**。代理(STORE)は既存「代理申込」画面(`/admin/store-requests`)に集約。一覧行→申込詳細へ遷移可能に。
  - **代理入力フォームに一時保存**を追加（`Application.draftData` に `{serviceLevel, cards}`）。`saveStoreInputDraft` アクション、詳細ページで復元。全ボタン `type="button"` でデータ消失を防止。
  - **カード単位の管理画面(`/admin/cards`)を廃止**。カードのステータス更新・Upcharge は申込詳細(`/admin/applications/[id]`)にインライン移設（`CardStatusForm`/`UpchargeForm` を `src/components/` へ移動）。**グレード登録機能(recordGrade/GradeForm)は廃止**（`psaCertNo`/`psaGrade`/`psaGradedAt` 列は破壊回避で残置・未使用）。
  - **PSA提出グループを申込単位に変更**。`Application.psaSubmissionGroupId` ＋ `PsaSubmissionGroup.applications[]` を追加（旧 `Card.psaSubmissionGroupId`/`cards[]` は残置・未使用）。グループは**サブミッションID＋申請番号(Order ID)＋提出日の紐づけのみ**（カードstatus伝播は廃止）。1サブミッション＝複数申込。
  - dashboard の PSA待ち/返却待ちはグループ status ベース（PREPARING/SUBMITTED の申込数）へ。
- 影響: `Application`/`PsaSubmissionGroup` に列追加（db push）。`createPsaSubmissionGroup(applicationIds)`/`submitPsaGroup`（ID記録のみ）へ変更。QR は申込詳細へ誘導。
- 未対応: 代理申込一覧(`getStoreRequests`)は STORE/DRAFT 全件表示のまま（未払い先払い前の申込も含む）。必要なら支払い済みフィルタを別途。


