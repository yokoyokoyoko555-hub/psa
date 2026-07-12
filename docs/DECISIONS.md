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


## ADR-0022: PSA US 鑑定料の小数点(セント)対応 + Stripe通貨バグ修正
- 日付: 2026-07-05 / 状態: Accepted（実装済）
- 背景: `AGENTS.md`は「金額は円・整数（最小単位）で扱う」と定めていたがJP専用時代の記述で、USD導入後の実態と合っていなかった。`ServicePrice`関連の金額列が全て`Int`のため、管理画面でPSA US鑑定料に`63.99`(USD)を入力できなかった。加えて`lib/stripe.ts`の`createPaymentIntent`/`chargeOffSession`が`currency: "jpy"`固定で、PSA US申込でも実際はJPYで決済されていた（実額が意図の1/150程度になる重大バグ）。
- 決定:
  - **スコープはPSA US鑑定料設定のみ**（`ServicePrice.pricePerCard`/`cost`/`maxDeclaredValue`）。`PricingSetting`（事務手数料・代理入力料金）・送料保険マトリクス・`Campaign`固定額割引は据え置き（JP/US共通で整数のまま）。
  - 金額はStripeの慣例に倣い**JPY=無位取り整数（既存通り）／USD=セント精度で小数点2桁を保持**する方式。DB型はスキーマ上そのまま実額（例: USDなら`63.99`）で保持し、Stripe API呼び出し時のみ`toStripeAmount()`で最小通貨単位へ変換する（`lib/currency.ts`に集約）。
  - 関連する`ServicePrice`/`Application`(`totalAmount`/`psaFeeTotal`/`taxAmount`/`prepaidAmount`)/`Card`(`psaFee`/`psaCost`)/`Payment.amount`列を`Int`→`Float`に変更。既存データは整数のままFloatとして有効なため非破壊。
  - `fee-calculator.ts`の丸め処理（原価フォールバック・消費税）を`roundMoney(amount, region)`に統一（JP=既存通り`Math.floor`維持／US=セント単位で四捨五入）。既存JPの計算結果は変化しない。
  - `lib/stripe.ts`の`createPaymentIntent`/`chargeOffSession`に`currency`引数を追加し、呼び出し側で`stripeCurrency(region)`（PSA_US→`"usd"`／それ以外→`"jpy"`）を明示指定するよう変更。`Payment.currency`列（既存・未使用だった）にも実値を保存。
  - 各画面の金額表示で`¥`ハードコード（`admin/applications`一覧・詳細、`admin/customers/[id]`、`admin/store-requests/[id]`、代理申込バリデーションエラー文言 等）を`formatMoney(amount, region)`に置換（US申込で誤って¥表示される既存バグの修正を含む）。
- 影響: `ServicePrice`/`Application`/`Card`/`Payment`のスキーマ変更（db push、非破壊）。`lib/currency.ts`に`roundMoney`/`toStripeAmount`/`stripeCurrency`を追加。`ServicePriceForm`（管理画面）はUS地域のみ`step="0.01"`で小数入力可。
- 未対応: `PricingSetting`（事務手数料・代理入力料金）、送料保険マトリクス、`Campaign`固定額割引、`Upcharge.upchargeAmount`、顧客の申告価格入力（`ApplyForm`declaredValue）は引き続き整数のみ。US側で端数請求が必要になった場合は別途スコープ拡張。


## ADR-0023: PSA US アイテム種別拡張（未開封パック／コミック・マガジン）+ Autographオプション + 言語自由記述化
- 日付: 2026-07-05 / 状態: Accepted（実装済・新規アイテム種別とAutographは価格未確定のプレースホルダー）
- 背景: 現行システムはトレーディングカードのPSA鑑定申込のみを扱っていたが、PSA USで未開封パック・コミック・マガジンの鑑定受付を追加したい（コミックとマガジンは運用上1区分に統合）。あわせてPSA USトレーディングカードにAutograph（デュアルサービス）の任意オプションを追加。PSA日本は対象外（トレカのみ・変更なし）。同時に、カードの「言語」入力を固定選択（旧`CardLanguage`enum）から自由記述に変更（例:「日本語」と直接入力）。
- 決定:
  - **新enum`ItemType`（`TRADING_CARD`/`UNOPENED_PACK`/`COMIC_MAGAZINE`）を導入**。`Application.itemType`に保持（申込単位。既存の`serviceLevel`/`region`と同じ粒度）。**`Card`には複製しない**（最小差分。1申込＝1アイテム種別の前提。トレカと他アイテムを混在させたい場合は申込を分ける運用）。
  - **アイテム種別ごとに専用の`ServiceLevel`enum値を追加**（トレカの既存13段階とは別体系。名称衝突を避けるため接頭辞で区別）:
    - 未開封パック: `PACK_VALUE`/`PACK_ECONOMY`/`PACK_EXPRESS`
    - コミック・マガジン: `COMIC_MODERN`/`COMIC_MODERN_PLUS`/`COMIC_VINTAGE`/`COMIC_VINTAGE_PLUS`/`COMIC_HIGH_VALUE`/`COMIC_EXPRESS`/`COMIC_SUPER_EXPRESS`/`COMIC_WALK_THROUGH`
    - 実価格は未確定のため`ServicePrice`に`pricePerCard:0, isActive:false`のプレースホルダーで投入（seed.ts）。管理画面で価格入力＋有効化するまで顧客画面には表示されない。
  - **`ServicePrice`のユニークキーに`itemType`を追加**（`[serviceLevel, region, itemType]`、既存行は`@default(TRADING_CARD)`で非破壊）。
  - **`PricingSetting`は`id`のPK構造を変えず、`region`/`itemType`列を追加**し`@@unique([region, itemType])`を新設（非破壊）。既存2行(id="PSA_JP"/"PSA_US")はseedの`upsert`で`region`/`itemType`をバックフィル。新規2行(US×UNOPENED_PACK/COMIC_MAGAZINE)は`id`を`"{region}_{itemType}"`で採番。
  - **`ShippingInsuranceRate`/`ShippingRule`/`InsuranceRule`にも`itemType`列を追加**（全て`@default(TRADING_CARD)`、非破壊）。新アイテム種別はデータ未投入のため送料・保険は当面$0（管理画面でレート追加すれば有効化）。
  - **新規`AutographPricing`モデル**（`region`+`serviceLevel`でユニーク、トレカの既存レベルのみ運用想定・`itemType`列は持たない＝呼び出し側でTRADING_CARD限定を保証）。Autographは**カード単位のオプトイン**（`Card.autographRequested`/`autographFee`）。価格はサービスレベルごとに異なる想定だが実価格は未確定のためプレースホルダー（`fee:0, isActive:false`）。
  - **料金計算（`fee-calculator.ts`）**: `calculateFees()`に`itemType`/`autographCount`を追加。全lookup（ServicePrice/PricingSetting/ShippingInsuranceRate/ShippingRule/InsuranceRule）に`itemType`フィルタを適用。Autograph料金はキャンペーン割引の対象外（鑑定料と同じ扱いで`subtotal`に直接加算）。
  - **顧客フロー**: 「①自己/代理入力選択→②地域選択→③アイテム種別選択(PSA_USのみ表示)→④サービスレベル選択→⑤カード情報入力」に拡張。JPでは③が非表示で常に`TRADING_CARD`（サーバー側でも強制補正）。代理入力の先払い見積り画面ではAutographを一切扱わない（スタッフが実物確認後の明細入力時に選択）。
  - **`Card.language`を`CardLanguage`enumから自由記述`String`へ変更**（`CardNameMaster.language`も同様）。UIは`<datalist>`で日本語/英語/韓国語/中国語/その他を候補表示しつつ自由入力可。PSA提出用1行コピー（`admin/applications/[id]`）の英語変換マップは新旧両方の値（自由記述の代表値＋旧enum値）に対応、それ以外はそのまま出力。
- 影響: `prisma/schema.prisma`に新enum・新モデル・複数列追加（db push、既存データは全て`@default`で非破壊）。`prisma/seed.ts`に新規プレースホルダー行を追加。`ApplyForm.tsx`/`StoreRequestForm.tsx`/`StoreInputForm.tsx`/管理画面設定（新規`AutographPricingForm.tsx`含む）を変更。
- 未対応: 未開封パック・コミック/マガジン・Autographの実価格は未確定（管理画面から入力が必要）。`Campaign`固定額割引・`Upcharge`は引き続きTRADING_CARD/itemType非対応のまま。
- **追記（デプロイ障害・即日修正）**: `PricingSetting`に`@@unique([region, itemType])`を追加してデプロイしたところ、既存2行(id="PSA_JP"/"PSA_US")が`db push`時点で`region`/`itemType`ともに同一デフォルト値（PSA_JP/TRADING_CARD）を取り、ユニークインデックス作成が`P2002`で衝突 → 本番ヘルスチェックが失敗し続ける障害が発生（2026-07-05）。**教訓: 複数の既存行を持つテーブルに新規列＋ユニーク制約を同一`db push`で追加すると、行ごとに異なるはずの値が全行同一のデフォルトになり衝突しうる**。対応として`@@unique`を`@@index`に変更し、一意性はアプリ側（`findFirst`→`create`/`update`）で担保する方式に変更（`saveUniformFees`/`fee-calculator.ts`/`admin.ts`）。同種の変更をする場合は「新規列追加→（必要なら別デプロイでバックフィル確認）→ユニーク制約追加」の順に分けるか、初めからアプリ側一意性担保に倒すこと。

## ADR-0024: 代理申込（先払い概算）の複数サービスレベル同時申請対応
- 日付: 2026-07-05 / 状態: Accepted（実装済）
- 背景: 代理申込の先払い見積り画面（`StoreRequestForm.tsx`）は従来「サービスレベルを1つ選択→枚数を1つ入力」という作りだったが、実運用では「レギュラー3枚＋エクスプレス2枚」のように複数レベルを1回の申込にまとめたい要望があった。実際のPSA提出の振り分けは当社（店舗スタッフ）側で行うため、顧客側は枚数内訳の申告のみでよい。
- 決定:
  - `Application`に`estimatedServiceLevels Json?`を追加（`[{serviceLevel, quantity}]`形式）。`estimatedCardCount`は全レベル合計枚数を格納（既存通り）。
  - `createStoreRequest`のスキーマを`serviceLevel: ServiceLevel, cardCount: number` → `serviceLevels: {serviceLevel, quantity}[]`（1〜20件）に変更。各レベルのService Priceを取得し`Σ(pricePerCard×quantity)`で鑑定料合計を算出、消費税・先払い概算を計算。
  - `Application.serviceLevel`（既存の必須フィールド）には代表値として配列の先頭要素を格納（店舗スタッフが明細確定時に別途選び直すため、実質的な意味は薄い）。
  - 顧客画面（`StoreRequestForm.tsx`）: サービスレベル一覧の各行に枚数入力欄を配置（右側）、申告上限も併記。入力された全レベルの合計枚数・合計金額をリアルタイム表示。
  - 管理画面（代理申込詳細 `admin/store-requests/[id]/page.tsx`）: 顧客が先払い時に申告したサービスレベル別内訳を表示し、スタッフが明細確定時の参考にできるようにした（実際の確定内容と一致しなくてもよい）。
- 影響: `Application.estimatedServiceLevels`列追加（db push、非破壊・nullable）。`createStoreRequest`のAPIシグネチャ変更（後方互換なし、呼び出し元は`StoreRequestForm.tsx`のみのため影響範囲は限定的）。

## ADR-0025: 動的サービスタイア（`CustomServicePrice`）CRUD化 + 通貨表示修正

- 日付: 2026-07-05 / 状態: Accepted（実装済）
- 背景: ADR-0023で追加した未開封パック・コミック/マガジン・Autographは、サービスレベルを固定enum（`PACK_VALUE`等11個 + `AutographPricing`）+ 事前seedしたプレースホルダー行として実装したため、管理画面では既存行の価格編集しかできず、**名称の追加・変更・削除ができなかった**（名称はTSXにハードコードされたラベルmap）。あわせて、申告上限（`maxDeclaredValue`）がPSA_US配下で誤ってドル小数点表示になる、代理入力料金・事務手数料・送料保険料（元々常に円建て）がPSA_USグループ配下で`$`ラベル表示になる、という通貨表示バグが見つかった。
- 決定:
  - **新モデル`CustomServicePrice`を追加**（`category: UNOPENED_PACK|COMIC_MAGAZINE|AUTOGRAPH`, `region`, `name`, `pricePerCard`, `cost`, `maxDeclaredValue`, `isActive`, `sortOrder`）。管理画面から名称・価格・原価・申告上限を自由に追加・編集・削除できる（`CustomServicePriceForm.tsx`、`CampaignForm.tsx`と同じ「一覧+編集/削除+＋追加+ドラフトパネル」パターン）。`@@index([category, region])`のみ（ADR-0023追記の教訓どおり、新規テーブルでも将来の衝突を避けるため`@@unique`は使わない）。
  - **`AutographPricing`モデルを削除**（破壊的だが全行`fee:0, isActive:false`のプレースホルダーで実データ無しのため安全。`db push --accept-data-loss`で削除）。
  - **`ServiceLevel`enumに`CUSTOM`を追加**（非TRADING_CARD申込の`Application.serviceLevel`用プレースホルダー値。実体は`customServiceLevelId`/`customServiceLevelName`参照）。`Application`/`Card`に`customServiceLevelId`・`customServiceLevelName`（スナップショット）等のID参照列を追加。
  - **ダブルパス方式**: `itemType === "TRADING_CARD"`は既存の固定enum + `ServicePrice`のロジックを一切変更しない。それ以外（`UNOPENED_PACK`/`COMIC_MAGAZINE`）とAutographは`CustomServicePrice`をID参照で扱う。`fee-calculator.ts`/`application.ts`/`admin.ts`/`ApplyForm.tsx`/`StoreRequestForm.tsx`/`StoreInputForm.tsx`すべてで同じ分岐条件を使用。
  - **通貨表示の修正**: `formatMoneyIn(amount, "JPY"|"USD")`（region非依存の明示的通貨指定フォーマッタ）を新設。`maxDeclaredValue`（`ServicePrice`・`CustomServicePrice`両方）は常に`formatMoneyIn(x, "JPY")`で表示・エラーメッセージに使用（`Card.declaredValue`と比較する値であり、常に円整数のため）。顧客の申告金額（`declaredValue`）自体も同様に常に円整数として`formatMoneyIn`表示に統一。代理入力料金・事務手数料・送料保険料（`PricingSetting`/`ShippingInsuranceRate`由来、常に円整数）も`formatMoneyIn(x, "JPY")`表示に統一し、管理画面の`HandlingFeeForm`/`ShippingInsuranceForm`の単位ラベルも常に「円」固定にした。鑑定料・原価・Autograph料金（`pricePerCard`/`cost`）は従来通りリージョン依存の`formatMoney(x, region)`のまま（PSA_USはドル小数点表示）。
  - **スコープ外（保留）**: 為替レートによるドル→円換算、および合計金額(`totalAmount`)・Stripe決済通貨のロジック変更は今回一切触っていない。USD建てのサービス料金と円建ての他手数料が混在する場合の合計金額計算・決済通貨の扱いは、ユーザーの明示的な指示により保留。
- 影響: `prisma/schema.prisma`（`AutographPricing`削除、`CustomServicePrice`追加、ID参照列追加）。`prisma/seed.ts`から旧`PACK_*`/`COMIC_*`プレースホルダーseedと`AutographPricing`seedを削除し、既存の`UNOPENED_PACK`/`COMIC_MAGAZINE`の`ServicePrice`行を`deleteMany`でクリーンアップ（`CustomServicePrice`は管理画面から追加する運用のためseed不要）。
- 未対応: 為替レート・合計金額の通貨統一ロジック（上記の通り保留）。

## ADR-0026: トレーディングカードも動的CRUD化（`CustomServicePrice`に統一） + 代理入力フローの簡素化

- 日付: 2026-07-05 / 状態: Accepted（実装済）
- 背景: ADR-0025では「トレカ＝既存`ServicePrice`固定enum方式のまま／それ以外＝`CustomServicePrice`」というダブルパス方式を採った。しかしトレカについても名称・価格・原価・申告上限を管理画面から自由にCRUD編集したいという要望があり、既存データ（`ServicePrice`の実売価格）を失わずに移行する必要があった。あわせて、代理申込（代理入力）の顧客向けフローが「サービスレベルを選び枚数×鑑定料を先払い」という設計だったが、実運用は「代理入力のみを先に依頼し、実際の鑑定料はカードお預け後にスタッフが確定して別途メールで請求する」という流れに変更したい、という要望があった。
- 決定:
  - **`CustomServiceCategory`に`TRADING_CARD`を追加**。ダブルパス方式を廃止し、`fee-calculator.ts`/`application.ts`/`admin.ts`/`ApplyForm.tsx`/`StoreInputForm.tsx`の全ロジックを「全itemType（トレカ含む）が`CustomServicePrice`をID参照する」単一パスに統一。
  - **既存データの非破壊移行**: `ensureTradingCardCustomPrices()`（`src/actions/pricing.ts`）を新設。リージョンごとに`CustomServicePrice(category=TRADING_CARD)`が1件も無ければ、既存`ServicePrice(itemType=TRADING_CARD)`の現在値（価格・原価・申告上限・有効フラグ）から複製する冪等処理。**`ServicePrice`テーブル自体は削除・変更せず残置**（過去データ保持・移行元データとして）。この移行は管理画面設定ページ・顧客申込ページ・代理申込明細入力ページの読み込み時に自動実行される（安価なCOUNTクエリで既に移行済みなら即スキップ）。
  - **`ServicePriceForm.tsx`と`/api/admin/service-prices`ルートを削除**（`CustomServicePriceForm.tsx`に統合。両リージョン・全itemTypeで同一コンポーネントを使用）。`CustomServicePriceForm`はリージョンに応じて価格入力欄の単位・step（PSA_US=ドル小数点2桁 / PSA_JP=円整数）を切り替えるよう修正（従来はPSA_US専用カテゴリのみだったため常にドル小数点前提だったが、トレカ×PSA_JPが追加されたため）。
  - **`Application.serviceLevel`は全itemTypeで常に`"CUSTOM"`**（トレカも含め、実体は`customServiceLevelId`/`customServiceLevelName`参照に統一）。既存の`ServiceLevel`固定enum値・過去データはそのまま保持（読み取り専用の履歴表示でのみ使用）。
  - **代理入力（`createStoreRequest`/`StoreRequestForm.tsx`）を全面簡素化**: サービスレベル選択・複数レベル数量入力（ADR-0024）を廃止し、「代理入力数（同一カードは1としてカウント）」の単一数値入力のみに変更。先払い金額は `代理入力数×代理入力料（PricingSetting.proxyFee） + 事務手数料（PricingSetting.handlingFee×代理入力数)` とし、**消費税は別途加算しない（内税として扱う）**。実際のサービスレベル・鑑定料は、カードお預け後にスタッフが`completeStoreApplication`で明細確定する際に選択・計算し、別途メールで請求する（この部分の請求フロー自体は元々`TODO(Stripe統合後)`のプレースホルダーのままで変更なし）。
  - **顧客向け文言の変更**: 「代理入力ではお客様に入力いただくのは代理入力する枚数・返送先・電話番号・クレジットカード情報のみ」「代理入力する枚数×代理入力費用のみ先にお支払い」「代理入力完了後、ご提出いただいたカードに応じた鑑定料を別途メールにてご請求」という説明文に統一（`StoreRequestForm.tsx`本文・利用規約テキスト）。
- 影響: `prisma/schema.prisma`（`CustomServiceCategory`に`TRADING_CARD`追加のみ、破壊的変更なし）。`Application.estimatedServiceLevels`は代理入力の新規申込では使われなくなる（過去データの表示コードはそのまま残置・後方互換）。`createStoreRequest`のAPIシグネチャ変更（`serviceLevels`/`customServiceLevels` → `agencyQuantity`。呼び出し元は`StoreRequestForm.tsx`のみのため影響範囲は限定的）。
- 未対応: 為替レート・合計金額の通貨統一ロジックは引き続き未対応（ADR-0025から継続）。代理入力完了後の鑑定料請求（Stripe off-session課金）は引き続き`TODO`のまま（本ADRのスコープ外）。

## ADR-0027: PSA US の申告金額・申告上限をUSD建てに変更

- 日付: 2026-07-05 / 状態: Accepted（実装済）
- 背景: ADR-0025で「申告上限（`maxDeclaredValue`）は常に円」という前提を置いていたが、これは顧客が入力する申告金額（`Card.declaredValue`）が常に円だったための整合措置だった。今回、PSA USの申告上限をUSD建てにしたいという要望があり、確認の結果「PSA USでは申告金額自体もUSD入力に変更する」方針に決定（円のままでは上限との比較が成立しないため）。
- 決定:
  - **`Card.declaredValue`と`CustomServicePrice.maxDeclaredValue`（旧`ServicePrice.maxDeclaredValue`含む）を「リージョン通貨・常に整数（小数点以下は扱わない）」に統一**。PSA_JP=円整数、PSA_US=USD整数（セント非対応）。鑑定料・原価（`pricePerCard`/`cost`）はこれまで通りPSA_USのみ小数点2桁のまま変更なし。
  - **新関数`formatMoneyInt(amount, region)`を`currency.ts`に追加**（リージョン通貨記号＋常に整数表示）。`formatMoneyIn(x, "JPY")`（代理入力料金・事務手数料・送料保険料など常に円の値専用）はそのまま維持し、申告金額・申告上限の表示は全て`formatMoneyInt`に置き換え。
  - 影響箇所: `ApplyForm.tsx`（申告金額入力欄ラベル・カード情報上限表示・カード一覧の申告額表示）、`CustomServicePriceForm.tsx`（管理画面の申告上限入力欄・一覧表示）、`StoreInputForm.tsx`（申告価格入力・上限表示）、`application.ts`/`admin.ts`（申告上限超過時のエラーメッセージ）、`admin/applications/[id]/page.tsx`・`mypage/submission-booking/[applicationId]/page.tsx`（申告額表示）。
  - バリデーションロジック自体（`declaredValue > maxDeclaredValue`の比較）は変更なし。両方が同一リージョンの同一通貨単位で保存されるようになったため、為替換算なしで従来通り成立する。
- 影響: 既存データは変更していないが、PSA_USの`CustomServicePrice(category=TRADING_CARD).maxDeclaredValue`はADR-0026の移行処理で旧`ServicePrice`（円換算の暫定値）からそのまま複製された数値が入っており、**USD金額として見ると桁が大きすぎる状態になっている**。管理画面から実際のUSD上限値に手動で修正する必要がある（運用上のフォローアップ、コード上の対応は不要）。
- 未対応: 為替レート・合計金額の通貨統一ロジックは引き続き未対応（ADR-0025/0026から継続）。

## ADR-0028: 本番障害 — `PricingSetting`のregion/itemTypeカラム不整合によるP2002（`saveUniformFees`）

- 日付: 2026-07-05 / 状態: Accepted（実装済・即日修正）
- 背景: 管理画面でPSA USの代理入力料金・事務手数料（`HandlingFeeForm`→`saveUniformFees`）を保存しようとすると、`prisma.pricingSetting.create()`が`Unique constraint failed on the fields: (id)`（P2002）で毎回失敗し、本番でアプリケーションエラーになっていた。
- 原因: ADR-0023の追記で記録した既知の問題（既存2行 id="PSA_JP"/"PSA_US" が `db push` 時点で `region`/`itemType` カラムともに同一デフォルト値になる）が、本番では一度も是正されていなかった。是正用の`seed.ts`の`upsert`は本番の起動コマンド（`prisma db push --accept-data-loss && next start`）では自動実行されないため、id="PSA_US"の行は`region`カラムが実際には`"PSA_JP"`のままだった。`saveUniformFees`は`findFirst({ where: { region, itemType } })`で既存行を探してから無ければ`create`する実装だったため、PSA_USを検索すると（region列が食い違っていて）該当行が見つからず、既存のid="PSA_US"と衝突する`create`を発行してP2002になっていた。同じ理由で、`fee-calculator.ts`・`application.ts`・`admin.ts`の`findFirst`によるPSA_US設定の**読み取り**も無言で失敗し、`proxyFee`/`handlingFee`が常に0として扱われていた（金額計算バグ・エラーにはならないため気づきにくい）。
- 決定:
  - **`PricingSetting`の参照・更新は常に主キー`id`で行う**よう統一（`region`/`itemType`カラムでの`findFirst`は廃止）。新規共有ヘルパー`src/lib/pricing-setting-id.ts`の`pricingSettingId(region, itemType)`を導入し、`pricing.ts`（`saveUniformFees`）・`fee-calculator.ts`・`application.ts`・`admin.ts`・`admin/settings/page.tsx`の全参照箇所をこれに統一。
  - `saveUniformFees`は`findFirst`→`create`/`update`から**`upsert({ where: { id } })`に変更**し、`update`時にも`region`/`itemType`を書き戻すようにした。これにより、次回いずれかのリージョンの設定を保存した時点でカラムの不整合が自己修復される（再データ移行は不要）。
- 影響: コード変更のみ（スキーマ変更なし）。既存の`PricingSetting`データは壊れたままだが、`id`ベースの参照に統一したことで実害はなくなった。ただし`region`/`itemType`カラムの値自体は、admin/settingsから該当リージョンの代理入力料金・事務手数料を一度保存するまで不正確なまま（表示上は影響しない）。
- 教訓: 「idベースのlookupで十分な場合は、非主キー列（`region`/`itemType`など、db push時にデフォルト値で衝突しうる列）でfindFirstしない」。ADR-0023のインシデントは`db push`時の一過性の問題として片付けていたが、実際には**恒久的にデータが壊れたまま**残り得ることを見落としていた。

## ADR-0029: デュアルサービス（オートグラフ）を「通常サービスの代わりに選ぶ」方式に変更（加算しない）

- 日付: 2026-07-06 / 状態: Accepted（実装済）
- 背景: ADR-0023〜0026では、デュアルサービス（カードとサインをまとめて鑑定するオプション）を通常のサービスレベルに**追加**する料金（`autographFeeTotal`を`psaFeeTotal`に加算）として実装していた。今回、デュアルサービスは通常サービスに追加するのではなく、**通常サービスの代わりに選ぶ**（完全に切り替える）方式に変更する要望があった。
- 決定:
  - **`fee-calculator.ts`**: `CustomServicePrice`のlookupを、PSA_US×TRADING_CARDに限り`category`を`[itemType, "AUTOGRAPH"]`のいずれかに拡張。顧客が選んだ`customServiceLevelId`が指すタイアが通常タイア(`category=TRADING_CARD`)かデュアルサービスタイア(`category=AUTOGRAPH`)かのどちらであっても、そのタイア1件の`pricePerCard`がそのまま`psaFeeTotal`になる（=デュアルサービスを選んだ場合、通常サービスの鑑定料は発生しない）。従来の`autographSelections`（タイアごとの枚数集計・加算計算）は削除し、`autographFeeTotal`/`autographCostTotal`は常に0固定（互換のため`FeeBreakdown`のフィールド自体は残置）。
  - **`application.ts`/`admin.ts`**: 選択された`customPrice.category`から`isDualService`を判定し、`Card.autographRequested`/`autographCustomServiceLevelId`/`autographCustomServiceLevelName`は記録用に引き続き設定するが、`autographFee`/`autographCost`は常に0（実際の料金は`psaFee`/`psaCost`に含まれているため、二重計上を避ける）。カードごとの個別オートグラフ選択（`cardSchema`/`storeCardSchema`の`autographRequested`/`autographCustomServiceLevelId`フィールド）は不要になったため削除。
  - **`ApplyForm.tsx`**: 顧客の「サービス選択」ステップに「鑑定の種類」として『通常サービス』『デュアルサービス（カードとサインの鑑定）』のモード切替を追加（PSA_US×TRADING_CARDかつデュアルサービスタイアが設定されている場合のみ表示）。どちらのモードで選んだタイアも同じ`customServiceLevelId`に書き込まれる。カード情報入力フォームからは（ADR-0026に続き）オートグラフ選択欄は存在しない。
  - **`StoreInputForm.tsx`**: スタッフのサービスレベル`<select>`に、通常タイアの選択肢に加えて「デュアルサービス」の`<optgroup>`を追加し、1つの`<select>`から通常/デュアルサービスいずれかを選ぶ形に統一。カードごとの個別オートグラフ選択欄は削除。
- 影響: `Card.autographFee`/`autographCost`は今後常に0で記録される（過去データはそのまま）。`Application.autographFeeTotal`も同様に常に0。`calculateFees`のシグネチャから`autographSelections`パラメータを削除（呼び出し元は`application.ts`/`admin.ts`のみのため影響範囲は限定的）。
- 未対応: 為替レート・合計金額の通貨統一ロジックは引き続き未対応（ADR-0025〜0027から継続）。

## ADR-0030: 発行年バリデーションのエラーメッセージ改善 + 事務手数料を定額化 + 消費税を内税表示に変更

- 日付: 2026-07-06 / 状態: Accepted（実装済）
- 背景: 自己申込（ApplyForm）で発行年に1900〜2100の範囲外の値（テスト時の仮入力など）を入力すると、クライアント側は素通りしサーバー側の`cardSchema`バリデーションでのみ弾かれるため、「入力内容が正しくありません」という原因不明のエラーになり決済へ進めなかった。あわせて、支払い内訳の表示について「鑑定料の隣にサービスレベル名を明記」「事務手数料はサービスレベル選択1回につき定額」「消費税は内消費税として内訳表示（合計金額は変えない）」という要望があった。
- 決定:
  - **`ApplyForm.tsx`の`saveDraft()`にクライアント側バリデーションを追加**: 発行年が入力されている場合、1900〜2100の範囲外なら「発行年は1900〜2100の範囲で入力してください（空欄でも構いません）」と明示的にエラー表示し、無効な値のままカードが確定リストへ入らないようにした（サーバー側`cardSchema`の制約はそのまま）。
  - **`fee-calculator.ts`**: 事務手数料(`handlingFee`)を「リージョン別一律額 × 枚数」から「リージョン別一律額のみ（枚数に関わらず1申込につき定額）」に変更。代理入力(STORE)側の`agencyFeeTotal`（種類数ベース）には影響しない。
  - **`ApplyForm.tsx`の確認画面**: 「鑑定料」の表示を常に「鑑定料（選択中のサービスレベル名）」に変更（デュアルサービス選択時に限定していたラベルを全ケースに統一）。「消費税」の独立行を廃止し、`taxAmount`と`totalAmount`の計算式自体は変更せず、「（内消費税 ¥X）」という注記を合計金額の下に表示する形に変更（**合計金額は変更しない。表示のみの変更**）。
- 影響: 事務手数料の実額が変更される（従来: 単価×枚数 → 変更後: 単価固定）ため、既存の`PricingSetting.handlingFee`設定値がそのまま「1申込あたりの定額」として適用される点に注意（管理画面での再設定は不要だが、実質的な負担額が変わる）。
- 未対応: 為替レート・合計金額の通貨統一ロジックは引き続き未対応（ADR-0025〜0027から継続）。

## ADR-0031: PSA US決済をJPY一本化（為替レート＋マージン管理）

- 日付: 2026-07-06 / 状態: Accepted（実装済）
- 背景: PSA USはドル建ての鑑定料（`psaFeeTotal`）と円建ての代理入力料金・事務手数料・送料保険（元々常に円）が混在しており、これまで両者を単純に加算して`totalAmount`とし、Stripe決済も`stripeCurrency(region)`により`"usd"`として全額をUSD建てで課金していた。これは円建て手数料が0でない限り実質的なバグで（例: $63.99＋¥1,100を単純加算した数値をそのままUSDとして課金＝約1,164ドルの誤課金）、ADR-0025〜0030で繰り返し「未対応」として先送りしてきた。ユーザーへの説明の結果、「Stripeの日本国内アカウントはJPYでしか着金せず、USD決済分もStripeが自動でJPY変換（手数料込み）してしまう」ことを確認し、**当社側で先にJPYへ変換してから決済する（レート・マージンを自社でコントロールする）**方針に合意した。
- 決定:
  - **新モデル`ExchangeRate`を追加**（`id`は`"default"`固定の1行運用、`PricingSetting`と同じsentinel-idパターン）。`usdJpyRate`（実勢レート）と`marginPercent`（上乗せ%）の2項目を管理画面で individually 設定できる方式を採用（ユーザーが「レート＋マージン%の2項目」を選択）。実効レート = `usdJpyRate × (1 + marginPercent/100)`（`lib/currency.ts`の`effectiveUsdJpyRate()`）。
  - **`fee-calculator.ts`**: PSA_USの場合のみ、`psaFeeTotal`（USD生値）を実効レートで円換算した`psaFeeTotalJpy`を算出し、`subtotal`/`taxAmount`/`totalAmount`の計算はこの円換算後の値を使う。`FeeBreakdown`が返す`psaFeeTotal`自体は**換算前の生値のまま**（顧客向けのドル表示・`Card.psaFee`/`psaCost`の原価記帳精度を保つため）。`ExchangeRate`が未設定の場合はPSA_USの計算時に明示的な日本語エラー（「為替レートが設定されていません。管理画面で設定してください。」）を投げる。
  - **`Application.exchangeRateUsed`を追加**（申込作成時点の実効レートのスナップショット。PSA_JPは常にnull）。管理画面でレートを後から変更しても過去の申込金額の根拠が追跡できるようにし、プレビュー時と実決済時のレートのズレも防ぐ。
  - **Stripe決済は常にJPY**に統一。`stripeCurrency()`/`toStripeAmount()`から`region`引数を削除し、無条件で`"jpy"`／整数丸めを返す（従来のUSD建て決済は完全に廃止）。
  - **`calculateFees()`の呼び出し元（`createApplication`/`completeStoreApplication`）はtry/catchでラップ**し、為替レート未設定時のエラーを`{success:false, error}`としてクリーンに返す（ADR-0028の本番P2002クラッシュの教訓を踏まえ、新規に追加した`throw`を未処理のまま本番に出さないための予防措置）。
  - **表示側**: 合計金額・内消費税・代理入力料金・事務手数料・送料保険・割引額など決済に関わる金額は全て`formatMoneyIn(x, "JPY")`に統一（`ApplyForm.tsx`／`mypage/applications/[id]/page.tsx`／`admin/applications/[id]/page.tsx`／`admin/applications/page.tsx`／メールテンプレートの金額差込）。PSA_US申込では「為替レート: $1 = ¥XXX（申込時点）」を`exchangeRateUsed`から表示。**`psaFeeTotal`（鑑定料）表示のみ従来通り`formatMoney(x, region)`のまま**（PSA_USはドル小数点表示を維持）。過去の`Payment`レコードはPSA_US時代にUSDで作成されたものが混在するため、admin詳細ページのPayment一覧は`Payment.currency`列の実値（`"usd"`/`"jpy"`）に応じて表示通貨を切り替える（一律JPY表示にはしない）。
- 影響: `prisma/schema.prisma`に`ExchangeRate`モデル・`Application.exchangeRateUsed`列を追加（db push、非破壊）。`lib/currency.ts`の`stripeCurrency`/`toStripeAmount`のシグネチャ変更（`region`引数削除、呼び出し元4箇所を修正）。管理画面設定ページに為替レート設定セクション（`ExchangeRateForm.tsx`）を追加。デプロイ後、管理画面で為替レート（レート・マージン%）を設定するまでPSA_USの新規申込は作成できない（明示的エラーで停止するため、無言の誤課金にはならない）。
- 未対応: 為替レートの自動取得（現状は手動設定のみ）。旧USD建て`Payment`レコードに対する返金・Upcharge時の通貨整合は個別対応（本ADRのスコープ外）。

## ADR-0032: 消費税計算を「内税抽出」方式に変更 + 代理申込Webhookのstatus上書きバグ修正

- 日付: 2026-07-06 / 状態: Accepted（実装済）
- 背景: 料金表（鑑定料・代理入力料金・事務手数料・送料保険料）はすべて税込み金額として設定・運用されているにもかかわらず、`fee-calculator.ts`は`subtotal`に対しさらに10%の消費税を加算して`totalAmount`を算出していた（二重課税）。ユーザーから「単純合計の内税だけ計算すればよく、消費税を別途かける必要はない」との指摘があり修正した。あわせて、代理申込（代理入力）の先払い決済後、管理画面の「代理申込」一覧にデータが反映されない不具合が報告され調査した結果、Stripe Webhookのバグが判明した。
- 決定:
  - **`fee-calculator.ts`**: `totalAmount`は`subtotal`（鑑定料JPY換算後＋代理入力料金＋送料保険＋事務手数料－割引）の単純合計とし、追加の10%加算を廃止。`taxAmount`（内消費税）は`totalAmount - Math.floor(totalAmount / 1.1)`で合計から逆算する内税抽出方式に変更。実際に顧客へ請求する金額（`totalAmount`）自体はこの変更の前後で「単純合計」という値そのものは変わらない（従来のバグ＝合計に対しさらに10%上乗せしていた分が是正され、結果的に旧実装よりも合計額は下がる）。
  - **Stripe Webhook（`api/stripe/webhook/route.ts`）の`handlePaymentSucceeded`のバグ修正**: 従来はPaymentに紐づく`Application`を無条件に`status: "SUBMITTED"`へ更新していたが、これは自己入力（`source: "CUSTOMER"`）を想定した処理であり、代理申込（`source: "STORE"`）の先払い決済ではカード未入力のため`status`は`DRAFT`のまま維持する設計（`confirmStorePrepayPayment`のコメント参照。ADR-0020）と矛盾していた。Webhookは非同期に発火するため、顧客側の`confirmStorePrepayPayment`（意図的に`status`を変更しない）と競合し、Webhookが先に／後に発火すると代理申込が`SUBMITTED`に書き換わってしまい、`getStoreRequests`の`status: "DRAFT"`フィルタから外れて管理画面「代理申込（要対応）」一覧に表示されなくなっていた。修正として、Webhook内で対象`Application`の`source`を確認し、`"CUSTOMER"`の場合のみ`status`を`"SUBMITTED"`に更新するよう限定した。
- 影響: 消費税の計算方式変更により、既存の運用上「合計金額に別途10%を上乗せしていた」誤りが是正される（画面表示・確認事項として、ユーザーへの実際の請求額が今後変わる点に注意）。Webhook修正はコード変更のみ（スキーマ変更なし）で、代理申込フローの本来の設計（先払い後もDRAFTのまま→スタッフが明細確定時にSUBMITTEDへ進める）に合わせた。
- 教訓: 複数の経路（クライアントからの直接呼び出し・Stripe Webhookの非同期通知）が同じ`Application`の状態を更新しうる設計では、各経路が「どのsource/フローを対象にした処理か」を明示的に確認しないと、意図しない状態遷移が発生する。

## ADR-0033: アイテム種別ごとの入力欄カスタマイズ（パック／コミック・マガジン）+ 初期値の空欄化

- 日付: 2026-07-06 / 状態: Accepted（実装済）
- 背景: PSA USの未開封パック・コミック/マガジンは、トレーディングカードと同じ「カード情報入力」フォーム（発行年・タイトル・言語・カード番号・カード名・レアリティ・枚数・申告金額）を流用していたが、パック・コミック/マガジンには「カード番号」「レアリティ」という概念が存在せず、コミック/マガジンには「出版社」「巻数・号」「発行年月（年月単位）」といった別の情報が必要だった。また、自己入力フォームの「言語」「枚数」が初期値としてそれぞれ「日本語」「1」で埋まっており、必ずしも入力者の実情報と一致しないまま見落とされる懸念があった。
- 決定:
  - **`Card`モデルのフィールドはitemTypeごとに複製せず、既存の汎用フィールドを意味的に読み替えて再利用する**（`ApplyForm.tsx`/`StoreInputForm.tsx`の入力欄ラベル・プレースホルダーのみをitemType別に切り替える設定オブジェクト`CARD_FIELD_LABELS`で制御）。
    - トレーディングカード（変更なし）: 発行年=`releaseYear`／タイトル=`tcgTitle`／言語=`language`／カード番号=`cardNumber`／カード名=`cardName`／レアリティ=`rarity`／枚数=`quantity`。
    - 未開封パック: 発行年=`releaseYear`／タイトル=`tcgTitle`／言語=`language`／**パック名**=`cardName`。`cardNumber`・`rarity`は入力欄を非表示にする（値は空文字のまま保存）。枚数・申告金額はそのまま維持。
    - コミック・マガジン: **発行年月**（自由記述）=`releaseYear`／タイトル=`tcgTitle`／**出版社**=`language`／**巻数・号**=`cardName`。`cardNumber`・`rarity`は非表示。**枚数→冊数**に表示名変更（`quantity`列自体は変更しない）。申告金額は維持。
  - **`Card.releaseYear`を`Int?`から`String?`へ変更**（db push、非破壊な型拡張）。トレカ・未開封パックは引き続き「発行年（西暦4桁）」の自由記述文字列として1900〜2100の範囲チェックをアプリケーション層（`createApplication`/`completeStoreApplication`内、itemTypeが`COMIC_MAGAZINE`以外の場合のみ）で行う。コミック・マガジンは「発行年月」の完全自由記述（例:「2022年5月」）としてこの範囲チェックの対象外とする。
  - **`language`フィールドは空欄入力を許可**し、未入力時はサーバー側（`cardSchema`/`storeCardSchema`のtransform）で「日本語」を自動補完する（`z.string().max(50).optional().transform(...)`）。コミック・マガジンでは同じフィールドを「出版社」として使うため、この場合の補完値「日本語」はトレカ/パック向けの後方互換上のデフォルトであり、コミック・マガジンの実運用では出版社名を都度入力する前提。
  - **自己入力フォーム（`ApplyForm.tsx`）の新規カード入力の初期値を変更**: `language`の初期値を`"日本語"`→空文字、`quantity`の初期値を`1`→`0`（表示上は空欄）に変更。ユーザー指摘「言語と枚数は空にしてほしい」に対応。代理申込のスタッフ入力（`StoreInputForm.tsx`）側の初期値は変更していない（スタッフは実物を確認しながら都度正確な値を入力する運用のため）。
  - **表示側**: 顧客・管理者向けの申込詳細ページ（`mypage/applications/[id]/page.tsx`／`admin/applications/[id]/page.tsx`）・代理入力スタッフ画面のカード見出し・PSA提出用1行コピー生成ロジックも、itemTypeに応じて見出し語（カード／パック／コミック・マガジン）・単位（枚／冊）・「言語」「出版社」ラベルを切り替える。`cardNumber`/`rarity`はパック・コミック/マガジンでは常に空文字のため、PSA提出用1行コピーの生成ロジック（複数フィールドを結合してフィルタする既存実装）はitemType分岐を追加しなくても自然に該当項目が省略される。
- 影響: `prisma/schema.prisma`（`Card.releaseYear`の型変更のみ、db push非破壊）。`application.ts`/`admin.ts`の`cardSchema`/`storeCardSchema`・年範囲バリデーションロジック変更。`ApplyForm.tsx`/`StoreInputForm.tsx`のカード入力UIの大幅な条件分岐追加。既存のトレカ入力フロー・データは一切変更なし（`CARD_FIELD_LABELS.TRADING_CARD`は旧来の見た目のまま）。
- 未対応: 代理申込の「カード提出予約」レシート画面（`mypage/submission-booking/[applicationId]/page.tsx`）はitemType別のラベル切り替えを行っていない（`cardNumber`が空文字の場合は自然に非表示になるため実害は小さいが、将来的に見出し語を統一する余地がある）。

## ADR-0034: 顧客向け申込一覧にステータス表示を追加（受取完了・PSA進捗の可変ステータス含む）

- 日付: 2026-07-07 / 状態: Accepted（実装済）
- 背景: 顧客向け「申込一覧」（`/mypage/applications`）にはステータス表示が無く、申込がどこまで進んでいるか（受取済みか、PSAへ発送済みか等）が顧客から分からなかった。既存の`CardStatus`enumはカード単位で細かい段階（受取・検品・PSA提出・鑑定中・返却等）を持つが、PSA側の進捗ラベル自体は将来的にPSAのポータル側の表記変更に合わせて増える可能性があるため、固定enumで先回りして網羅するのではなく、「PSA受領済み」以降の段階だけ管理画面で自由に名前を追加できる可変リストにしたいという要望があった。
- 決定:
  - **顧客向けステータスは4段階の考え方**: ①申込完了（既存の`ApplicationStatus`が`DRAFT`でなくなった時点） → ②受取完了（新規`Application.receivedAt`、管理画面の申込詳細ページの「受取完了にする」ボタンで設定） → ③発送完了（既存の`PsaSubmissionGroup.submittedAt`/`status`から導出。ADR-0021のグループ提出時に自動的に成立、新規フィールド不要） → ④PSA進捗ステータス（`PsaSubmissionGroup.status`が`PREPARING`/`SUBMITTED`以外の値になった場合、その文字列をそのまま表示）。
  - **`Application.receivedAt DateTime?`を追加**。新規サーバーアクション`markApplicationReceived()`（`admin.ts`）が、実行時に配下の全カードを`CardStatus.RECEIVED_BY_STORE`へ一括更新し、`CardStatusHistory`にも記録する。ボタンは申込詳細ページ（`/admin/applications/[id]`）にのみ設置（ユーザーの選択）。
  - **新モデル`PsaProgressStatus`（id/name/sortOrder/isActive）を追加**。`PricingSetting`同様の「管理画面で自由に追加・編集・削除できる名称マスタ」で、実体は`PsaSubmissionGroup.status`（既存の自由記述String列。ADR-0021時点で既にFK制約のない文字列だったため新たな外部キーは持たせず、選択メニュー用のマスタとして機能する）へ選んだ名前をそのまま書き込むだけの単純な仕組みにした。管理画面設定ページに管理UI（`PsaProgressStatusForm.tsx`）、PSA提出グループ管理ページ（`/admin/psa-groups`）に「発送完了後のグループに対し選択→一括反映」フォーム（`AdvanceGroupStatusForm.tsx`）を追加。**ユーザーの確認により、この可変ステータスはPSA提出グループ単位（＝グループに属する全申込へ一括反映）とし、申込ごとの個別設定は行わない**仕様とした。
  - **顧客向け一覧（`ApplicationCenter.tsx`）に「提出済み」セクションのステータスバッジを追加**。`getMyApplications()`に`psaSubmissionGroup`のselectを追加し、`mypage/applications/page.tsx`の`computeDisplayStatus()`で上記4段階のいずれかを算出して表示する。
  - **「作業中」セクションから代理入力(`source=STORE`)を除外**（先払い後は予約・確認フローで既に案内されているため、重複表示を避ける）。
  - **「提出済み」セクションの日時表示に時刻を追加**（`fmtTime()`）。
- 影響: `prisma/schema.prisma`に`Application.receivedAt`・新モデル`PsaProgressStatus`を追加（db push、非破壊）。`admin.ts`に`markApplicationReceived`/`advanceGroupStatus`、新規`src/actions/psa-progress.ts`にCRUDアクションを追加。
- 未対応: PSA進捗ステータスの遷移順序・逆戻り防止のバリデーションは行っていない（管理画面操作者の裁量に委ねる）。カード単位での個別ステータスの可視化（顧客向け）は引き続き申込詳細ページ側のみ。

## ADR-0035: 提出予約の改修（名称統一・満席判定・郵送先住所の管理画面編集）

- 日付: 2026-07-07 / 状態: Accepted（実装済）
- 背景: 「カード提出予約」という名称が画面ごとに「提出予約」と表記ゆれしていた（ADR-0033のカード非依存化の流れに合わせ統一したい）。また、店頭持込の予約は時間帯ごとの予約枠という概念があるにもかかわらず満席判定が無く、複数の顧客が同じ日時を選べてしまっていた。郵送を選ぶ顧客には発送先住所を案内する仕組みが無かった。
- 決定:
  - **名称統一**: 画面上の「カード提出予約」を全て「提出予約」に統一（`mypage/applications/[id]/page.tsx`・`mypage/page.tsx`・`mypage/submission-booking`配下・`ApplyForm.tsx`/`StoreRequestForm.tsx`のエラーメッセージ・`admin/applications/[id]/page.tsx`）。
  - **店頭持込の満席判定**: `SubmissionBooking`（既存モデル、変更なし）から`method=STORE_DROP_OFF`・`status=BOOKED`・自分自身の申込以外の予約日時を集計し、`BookingForm.tsx`で該当する時間帯ボタンを無効化（グレーアウト＋「満席です」ツールチップ）。カレンダー上でも、その日の全時間帯（7枠）が埋まっている場合は日付自体をクリック不可にし「満席」バッジを表示する。予約枠は1日時につき1件（同一時間帯の重複予約不可）という前提。郵送(`SHIPPING`)にはこの制約を適用しない。
  - **郵送選択時のUI変更**: 「時間」の時間帯選択UIを非表示にし、「発送日を選択してください」という案内文に置き換える（郵送は日付のみ必要で、正確な時刻は不要なため）。送信時の`scheduledAt`は日付＋固定時刻`00:00`で記録する。
  - **新モデル`StoreSettings`を追加**（`PricingSetting`/`ExchangeRate`と同じ、id="default"固定の1行運用パターン）。郵便番号・住所・店舗名（宛名）・電話番号を保持し、管理画面の設定ページに`StoreSettingsForm.tsx`で編集UIを追加。郵送選択時、`BookingForm.tsx`にこの内容をそのまま「郵送先」ブロックとして表示する。
- 影響: `prisma/schema.prisma`に`StoreSettings`モデルを追加（db push、非破壊）。`BookingForm.tsx`のprops追加（`takenSlots`・`storeAddress`）に伴い、呼び出し元`mypage/submission-booking/[applicationId]/edit/page.tsx`で予約集計クエリと店舗設定取得を追加。
- 未対応: 満席判定は「1日時=1件まで」固定の前提（複数人受け入れ可能な時間帯を将来的に設定したい場合は容量（capacity）概念の追加が必要）。郵送先住所が未設定（`StoreSettings`が空）の場合は住所ブロックを表示しないだけで、エラーにはしていない。

## ADR-0036: 管理画面の申込管理を改修（一覧の列・ソート・ステータス同期、詳細ページのUpcharge申込単位化）

- 日付: 2026-07-07 / 状態: Accepted（実装済）
- 背景: 管理画面の申込一覧は顧客・PSA提出先・アイテム種別・サービスレベルが分からず、提出予約の有無も確認できなかった。また一覧のステータス列は`ApplicationStatus`（DRAFT/SUBMITTED/IN_PROGRESS/COMPLETED/CANCELLED）の生値を表示しており、顧客向け一覧（ADR-0034で導入した「申込完了/受取完了/発送完了/PSA進捗ステータス」）と食い違っていた。申込詳細ページでは「サービス」表示が`Application.serviceLevel`（ADR-0026以降常に`"CUSTOM"`）の生値のままでバグっており、配送先住所も表示されていなかった。カード単位のステータス変更・Upcharge登録UIも、実運用では受取完了・PSA提出はADR-0034で申込/グループ単位の一括操作に統一されており、カードごとの個別操作は冗長になっていた。
- 決定:
  - **共有ユーティリティ`src/lib/application-status.ts`を新設**（`REGION_LABELS`/`ITEM_TYPE_LABELS`/`SERVICE_LABELS`/`resolveServiceLevel()`/`computeDisplayStatus()`）。顧客向け一覧（`mypage/applications/page.tsx`）で使っていたロジックをここに切り出し、管理画面の一覧・詳細ページからも同じ関数を呼ぶことで「ステータス表示のズレ」を構造的に防ぐ。
  - **管理画面の申込一覧（`admin/applications/page.tsx`）**: 提出先・アイテム種別・サービスレベル・提出予約状況（未予約／店頭持込／郵送＋予約日時）・ステータス（顧客向けと同じ算出ロジック、`CANCELLED`のみ例外的に「キャンセル」表示）の列を追加。提出先・アイテム種別・サービスレベル・ステータスは列見出しのリンクでソート可能（`?sort=`/`?dir=`のクエリパラメータ、同一カラム再クリックで昇順⇄降順）。**ソートは表示ラベルに対する算出後のJS内ソートのため、現在ページ内（50件）でのみ有効**（DBの生カラムだけでは提出先ラベルやPSA進捗ステータス名を正しく順序付けできないための割り切り）。下書き(`status=DRAFT`)は常に一覧から除外。顧客名をクリックすると顧客詳細ページへ遷移する。
  - **申込詳細ページ（`admin/applications/[id]/page.tsx`）**: サマリーに「提出先」を追加、「サービス」表示を`resolveServiceLevel()`に修正（従来の生値表示バグを修正）。返却方法が配送(`SHIPPING`)の場合のみ「配送先住所」セクションを追加（`Application.shippingAddressEncrypted`があればそれを復号、無ければ顧客の登録住所にフォールバック）。
  - **カード一覧からステータスバッジ・Upcharge表示・個別操作フォーム（`CardStatusForm`/`UpchargeForm`の埋め込み）を削除**。`CardStatusForm.tsx`は他に利用箇所が無いため削除（他画面で個別カードステータス変更が必要になった場合は別途復活を検討）。QRコード印刷リンクのみ各カード行に残置。
  - **Upchargeを申込単位で管理**: `UpchargeForm`を「対象カードを選択するセレクトボックス付き」に変更（`cardId`直接指定 → `cards: {id, label}[]`を受け取り選択式に）。申込詳細ページのカード一覧の下（Payments履歴の上）に、その申込に属する全カードのUpcharge一覧＋登録フォームをまとめた新しい「Upcharge」セクションを追加。`Upcharge`モデル自体（`cardId`必須）は変更していない。
- 影響: `prisma/schema.prisma`の変更なし。`src/components/CardStatusForm.tsx`を削除。`src/components/UpchargeForm.tsx`のprops変更（呼び出し元は`admin/applications/[id]/page.tsx`のみ）。
- 未対応: カード単位の個別ステータス変更手段が管理画面から無くなった（受取完了・PSA提出はADR-0034の一括操作で代替、それ以外の個別ステータス変更が必要になった場合は別途UIの復活を検討）。一覧のソートは現在ページ内のみで全件横断ソートではない。

## ADR-0037: 代理入力フォームの改修（申込総数の追加・アイテム種別の常時表示）

- 日付: 2026-07-07 / 状態: Accepted（実装済）
- 背景: 代理入力（先払い）フォームでは「代理入力数」（同一カードを1としてカウントする種類数、料金計算の基準）のみを入力していたが、当社側で受入準備をする上で実際にお預かりする総数（種類数ではなく総枚数の目安）も事前に把握したいという要望があった。またアイテム種別の表示がPSA US選択時のみで、PSA日本選択時は「トレーディングカードで確定している」ことが画面上わからなかった。
- 決定:
  - **「申込総数」入力欄を追加**（代理入力数とは別に、当社の総量把握のためだけの参考値。**料金計算には一切使用しない**）。既存の`Application.estimatedCardCount`フィールド（ADR-0020で「顧客が申告したカード枚数（概算根拠）」として定義済みだったが、実際にはこれまで`agencyQuantity`と同値がそのまま入っていた）に格納する形とし、**新規スキーマ変更は行わなかった**。
  - **代理入力数・申込総数の入力欄を1つのセクション「代理入力数・申込総数」にまとめ、ラベルと入力欄を横並び（`flex justify-between`）に統一**。
  - **アイテム種別セクションをPSA日本選択時も常に表示**。PSA US選択時は従来通り3択のボタン（トレーディングカード/未開封パック/コミック・マガジン）、PSA日本選択時は「トレーディングカード」の固定表示（選択不可・選択中と同じスタイルの1枠のみ）に切り替え、"1択だが何を提出するか明示"できるようにした。
  - **利用規約・画面上部の説明文を更新**し、「お客様に入力いただくのは代理入力する枚数・**申込総数**・返送先・電話番号・クレジットカード情報のみです」という文言に統一。
- 影響: `prisma/schema.prisma`の変更なし（既存フィールドの用途を明確化しただけ）。`createStoreRequest`のスキーマに`estimatedTotalCount`を追加（必須項目、呼び出し元は`StoreRequestForm.tsx`のみのため影響範囲は限定的）。
- 未対応: 申込総数と代理入力数の整合性チェック（例: 申込総数が代理入力数を下回っていないか等）は行っていない（あくまで参考値のため、意図的にバリデーションを緩くしている）。

## ADR-0038: 代理申込のカード別サービスレベル対応 + 確定分の差額を自動請求

- 日付: 2026-07-07 / 状態: Accepted（実装済）
- 背景: 代理申込の明細確定画面（`StoreInputForm.tsx`）は、申込単位で1つの`customServiceLevelId`しか選べず、実際にはカードごとに異なるサービスレベル（例: 一部はレギュラー、一部はエクスプレス）で提出したいケースに対応できなかった。また、先払い（`createStoreRequest`）は代理入力料金の概算のみを徴収し、明細確定時に決まる鑑定料・事務手数料・送料保険等を含む最終合計との差額を請求する仕組みが「Stripe統合後」のTODOのまま放置されていた（`completeStoreApplication`は`Payment`を`PENDING`のまま作成するだけで、実際の課金は一切行われていなかった）。加えて、代理申込は完了しても管理画面の「申込管理」に一切反映されず、確定後の状態を追えなかった。
- 決定:
  - **`Card.customServiceLevelId`/`customServiceLevelName`を追加**（カード単位のサービスレベル・スナップショット名）。`StoreInputForm.tsx`の明細入力を「カードごとに個別の`<select>`で選ぶ」形式に変更し、申込単位の単一選択は廃止。よくある「全カード同じレベル」向けに、一括で全行へ適用する「一括設定」の簡易操作も残した。
  - **`fee-calculator.ts`の`calculateFees()`に`cardServiceLevels`パラメータを追加**（`{customServiceLevelId, quantity}[]`）。指定時は複数タイアの`pricePerCard`/`cost`をそれぞれ合算し、`psaFeeTotal`/`psaCostTotal`を算出する。既存の単一`customServiceLevelId`指定（自己入力・先払い見積り）は変更なし。
  - **申告価格上限のチェックをカードごとに、そのカードが選んだタイアの上限と比較する**ように変更（従来は申込全体で1つの上限だった）。
  - **先払い済み額(`prepaidAmount`)を超える残額を、登録済みカードへ即時off-session課金で自動請求する**（Upchargeと全く同じ仕組みを流用）。`lib/stripe.ts`の`chargeOffSession()`の`upchargeId`パラメータを汎用的な`referenceId`に改名し、Upcharge以外の請求（今回の代理申込確定分請求）でも使えるようにした。課金が失敗した場合は`Payment.status`を`FAILED`にし、`failureReason`を記録して申込自体の確定は妨げない（スタッフが後で個別対応する前提）。残額が0円以下の場合は追加請求自体を行わない。
  - **管理画面の「申込管理」（`admin/applications/page.tsx`）から`source: "CUSTOMER"`限定のフィルタを撤廃**し、代理入力(STORE)も明細確定後（`status`が`DRAFT`でなくなった時点）に表示されるようにした。「種別」列（自己入力／代理入力バッジ）を追加し、ページタイトルも「申込管理（自己入力）」→「申込管理」に変更。
  - **「代理申込（要対応）」一覧（`admin/store-requests/page.tsx`）に「代理入力数」「総枚数」列を追加**（提出先の右）。表示元として`Application.agencyQuantity`（新規フィールド。顧客が先払い時に申告した代理入力数の生値）を追加し、`createStoreRequest`で保存するようにした。
- 影響: `prisma/schema.prisma`に`Card.customServiceLevelId`/`customServiceLevelName`・`Application.agencyQuantity`を追加（db push、非破壊）。`completeStoreApplication`/`saveStoreInputDraft`のAPIシグネチャ変更（申込単位の`customServiceLevelId`引数を廃止し、カードごとの`customServiceLevelId`に統一。呼び出し元は`StoreInputForm.tsx`のみのため影響範囲は限定的）。`chargeOffSession()`の引数名変更（`upchargeId`→`referenceId`、呼び出し元2箇所を修正）。
- 未対応: off-session課金が失敗した場合の再請求・顧客への通知UIは用意していない（`Payment.status=FAILED`のレコードを管理画面から目視確認し、個別対応する運用を前提とする）。「申込管理」の決済列は「いずれかの支払いが成功しているか」のみを見ており、代理申込特有の「先払い＋確定分請求の両方が完了しているか」は区別して表示していない。

## ADR-0039: Upchargeフォームの簡略化（申告関係フィールド廃止・対象カードのラベル改善）

- 日付: 2026-07-07 / 状態: Accepted（実装済）
- 背景: ADR-0036でUpchargeを申込単位のカード選択式フォームに変更した際、対象カードの`<select>`ラベルが`card.cardName`のみだったため、同一申込内に類似名のカードが複数あると「入力後に何が何だか分からない」状態になっていた。また`psaDeclaredValue`（PSA申告額）・`psaFinalValue`（最終評価額）の2項目は運用上ほぼ使われておらず、実務では「対象カード・理由・Upcharge額」の3項目だけで足りるという指摘があった。
- 決定:
  - **`UpchargeForm.tsx`から`psaDeclaredValue`/`psaFinalValue`の入力欄を削除**し、対象カード（`cardId`）・理由（`reason`）・Upcharge額（`upchargeAmount`）の3項目のみに簡略化。各欄にラベルを追加して用途を明示。
  - **`Upcharge.psaDeclaredValue`/`psaFinalValue`を`Int?`に変更**（非破壊のnullable化。過去データは保持したまま、以後の入力を必須から除外）。`createUpcharge()`の`upchargeSchema`・`prisma.upcharge.create()`からもこの2項目を削除。
  - **対象カード選択の表示ラベルを`card.cardName` + `card.tcgTitle` + 申告額に拡張**（`admin/applications/[id]/page.tsx`）。同一申込内の複数カードを一意に識別できるようにした（当初`card.cardNo`も含めていたが、カードIDは不要とのフィードバックを受け除外）。
  - **複数カードへのUpchargeは、1件＝1カードとして「続けて登録」ボタンでカードごとに繰り返し登録する運用のまま**とした（`Upcharge`モデルは元々1レコード=1カード固定であり、金額按分や複数カード同時請求は実務上ケースバイケースで異なるため、スキーマ変更は行わず案内文をフォームに追記するに留めた）。
  - **`createUpcharge()`内の顧客通知メール送信(`sendMail`)をtry/catchで囲み、送信失敗が登録処理全体の失敗として扱われないように修正**。従来はメール送信の例外が捕捉されておらず、Upcharge自体はDB登録済みなのにクライアントには「登録に失敗しました」と表示される不整合があった（`customer.ts`の既存パターンに合わせた）。
- 影響: `prisma/schema.prisma`の`Upcharge.psaDeclaredValue`/`psaFinalValue`を`Int`→`Int?`に変更（`db push --accept-data-loss`で反映、既存データは変更なし）。`UpchargeForm.tsx`・`createUpcharge()`の引数から2項目を削除（呼び出し元はこのフォームのみのため影響範囲は限定的）。
- 未対応: 複数カードへの一括Upcharge登録UI（1回の操作で複数カードに同時登録）は用意していない。将来的にニーズが増えた場合は、カード複数選択+共通理由/金額での一括作成アクションを別途検討する。

## ADR-0040: 店頭受付を「受付番号提示＋本人確認のみ」に簡略化（現物照合レシートを廃止）

- 日付: 2026-07-07 / 状態: Accepted（実装済）
- 背景: [SUBMISSION_BOOKING.md](SUBMISSION_BOOKING.md)の設計に基づき、提出予約詳細ページ（`/mypage/submission-booking/[applicationId]`）は「店員と顧客が現物カードとカード明細リストを面前で1点ずつ突合する」ための店頭提示レシートとして実装済みだった（申込番号・予約日時・提出方法・顧客名に加え、カード名・言語・申告額等を含むカード明細一覧を表示）。今回、運用上はそこまでの現物照合を店頭受付時に行う必要はなく、**受付番号（申込番号）の提示と本人確認書類によるご本人確認のみ**で受付を完了させたいという方針転換があった。また併せて、TASKS.mdに残っていた「カード提出予約のリファイン（店頭提示レシート）」「ACCOUNTINGロールの権限設計」の2項目は不要と判断された。
- 決定:
  - **`/mypage/submission-booking/[applicationId]`からカード明細リスト（現物照合用）を削除**。ページは申込番号（=受付番号として表示）・予約日時・提出方法・顧客名のみを表示し、案内文を「受付番号の画面提示と本人確認書類でのご本人確認のみで受付する」内容に変更。カードの内容確認は受付後にスタッフが別途行う運用とする。
  - 上記に伴い、ページで使っていた`SERVICE_LABELS`/`LANG_LABELS`定数・`formatMoneyInt`・`cards`のPrisma include（未使用化）を削除。
  - [SUBMISSION_BOOKING.md](SUBMISSION_BOOKING.md) §5を「店頭提示レシート」から「受付番号ページ」に改訂し、現物照合要件を取り消し線で明示。
  - `docs/TASKS.md`から「カード提出予約のリファイン（店頭提示レシート）」「ACCOUNTINGロールの権限設計」の2項目を削除（不要と判断されたため）。
- 影響: `src/app/mypage/submission-booking/[applicationId]/page.tsx`のみ変更（スキーマ変更なし）。郵送(`SHIPPING`)の受付フローは変更なし（到着後にスタッフが受け付ける旨の案内のまま）。
- 未対応: 店頭受付時の本人確認自体（免許証等の目視確認）はスタッフの手作業運用のままで、システム上の記録・ログは取らない。カードの内容確認（枚数・現物一致）は受付後にスタッフが行う前提だが、その具体的な手順（いつ・どの画面で）は本ADRのスコープ外。

## ADR-0041: `generateCardNo()`のトランザクション未対応バグを修正（2枚以上のカード申込が保存失敗する不具合）

- 日付: 2026-07-07 / 状態: Accepted（実装済）
- 背景: 代理申込の明細確定（`completeStoreApplication`）で、カードを2枚以上入力すると「申込データの保存に失敗しました」というエラーで保存できない不具合が発生した。原因は`lib/number-generator.ts`の`generateCardNo()`が、採番のための`prisma.card.count()`をグローバルな`prisma`クライアントで実行していたこと。`completeStoreApplication`・`createApplication`はいずれもカード作成を`prisma.$transaction(async (tx) => {...})`内のループで行うが、ループ内で呼ぶ`generateCardNo()`はグローバルクライアント（トランザクション外の別コネクション）でカウントするため、同一トランザクション内でまだコミットされていない直前のカード作成が見えない。その結果、2枚目以降のカードが1枚目と同じ`cardNo`を算出してしまい、`Card.cardNo`の一意制約違反（P2002）で例外が発生し、トランザクション全体が失敗していた。1枚のみの申込では再現しないため見過ごされていた。
- 決定:
  - **`generateApplicationNo`/`generateCardNo`/`generateMemberNo`/`generateGroupNo`（`lib/number-generator.ts`）に、採番に使うPrismaクライアントを渡せる`db`引数を追加**（既定値=グローバル`prisma`、型は`Pick<PrismaClient, "application" | "card" | "customer" | "psaSubmissionGroup">`）。
  - **`admin.ts`の`completeStoreApplication`・`application.ts`の`createApplication`のループ内呼び出しを`generateCardNo(tx)`に変更**し、同一トランザクション内の直前の作成分を正しくカウントできるようにした。
- 影響: `lib/number-generator.ts`の4関数のシグネチャ変更（既定値ありの追加引数のため既存の呼び出し元は変更不要。ループ内の2箇所のみ`tx`を明示的に渡すよう修正）。スキーマ変更なし。
- 未対応: `generateApplicationNo`/`generateGroupNo`/`generateMemberNo`はループ内で呼ばれておらず今回のバグの直接原因ではないため動作確認のみ（呼び出し元の変更は行っていない）。複数リクエストが同時に同じ日付の採番を行った場合の競合（トランザクション跨ぎの重複）は本修正のスコープ外（従来からの既知の制約）。

## ADR-0042: 代理入力の確定分請求を「当社レビュー＋顧客能動支払い」方式に変更（自動課金を廃止）

- 日付: 2026-07-08 / 状態: Accepted（実装済）
- 背景: ADR-0038で実装した代理申込の確定分差額請求は、スタッフが`StoreInputForm`でカード明細・サービスレベルを入力した直後に、計算結果をレビューする間もなく顧客の保存カードへ即座にoff-session自動課金されていた。しかし代理入力はあくまで顧客からの業務委託（納品物はカード明細の入力データ）であり、実務上は「当社が請求内容（鑑定料・事務手数料・送料保険料・代理入力手数料の増減）を確認してから確定し、顧客がマイページで内容を確認のうえ能動的に支払う」フローが必要という指摘があった。あわせて、先払い額が確定金額を上回った場合（返金が必要なケース）の扱いも論点になったが、先払いは代理入力手数料の見積りのみを対象としており、鑑定料・事務手数料・送料保険料は先払いに一切含まれず常に新規追加されるため、確定金額が先払い額を下回ることは構造上ほぼ起こり得ないと判断し、返金ロジックは実装しないこととした。また、請求項目（鑑定料/事務手数料/送料保険料/代理入力手数料）をスタッフが個別に編集できるようにする案も検討したが、代理入力手数料の種類数ベース計算など既存の計算ロジック自体は正しく実装されているため、編集機能ではなく「確認のみ（編集不可）」のプレビューで十分と判断した。
- 決定:
  - **`admin.ts`に`previewStoreApplicationFees()`を新設**。`completeStoreApplication`と同じ検証＋`calculateFees()`呼び出しを共通化した`validateAndCalculateStoreFees()`を経由し、確定（DB書き込み）はせずに料金内訳と代理入力手数料の「見積り種類数→実績種類数」比較を返す。
  - **`StoreInputForm.tsx`に確定前のプレビュー確認ステップを追加**。「料金を確認する」ボタンでプレビューを取得し、鑑定料・代理入力手数料（見積り比較付き）・事務手数料・送料保険料・割引・合計・消費税・先払い済み額・顧客への請求額（差額）を編集不可の一覧で表示。カード明細を編集するとプレビューは自動的に破棄され、必ず最新内容で再確認してから「この内容で確定する」を押す流れになる。
  - **`completeStoreApplication`から自動off-session課金（`chargeOffSession`呼び出し）を完全に削除**。確定時は差額をPENDINGの`Payment`として登録するのみとし、顧客への通知メール（`store_input_completed`）は従来通り送信する。
  - **`actions/payment.ts`に`createDifferentialPaymentIntent`/`confirmDifferentialPayment`を新設**。顧客が保存済みデフォルトカードを持つ場合はStripe側に事前アタッチしたPaymentIntentを作成し、クライアントは`confirmCardPayment(clientSecret)`のみでカード再入力なしに支払える（オンセッション・顧客present）。保存カードが無い場合は既存の`components/StripeCardPayment.tsx`を再利用してカード入力から支払う。
  - **`mypage/applications/[id]/page.tsx`に`DifferentialPaymentPanel`（新規コンポーネント）を追加**。該当申込にPENDINGの`Payment`がある場合のみ表示し、顧客が内容を確認して能動的に「支払う」を押すまでは課金されない。
  - **`lib/stripe.ts`の`createPaymentIntent`に`paymentMethodId`引数を追加**（既存呼び出しは省略可・後方互換）。
- 影響: `completeStoreApplication`のAPIシグネチャ自体は変更なし（`feeOverrides`等の編集用パラメータは追加していない）。`chargeOffSession`は他の呼び出し元（`createUpcharge`）で引き続き使用するため`lib/stripe.ts`からは削除していない。スキーマ変更なし。
- 未対応: 先払い額超過（返金が必要なケース）は上記の理由により未実装。もし将来、代理入力手数料以外の要素も含めて先払い額を引き上げる仕様変更を行う場合は、返金ロジックの要否を再検討すること。

## ADR-0043: オートグラフ（デュアルサービス）に専用の代理入力料金・事務手数料・送料保険料を追加

- 日付: 2026-07-08 / 状態: Accepted（実装済）
- 背景: 管理画面の料金設定で、PSA US配下のオートグラフ（デュアルサービス）セクションは、鑑定料タイア（`CustomServicePrice` category=AUTOGRAPH）の設定のみを持ち、代理入力料金・事務手数料・送料保険料は通常のトレーディングカード（`itemType=TRADING_CARD`）の設定がそのまま適用されていた。オートグラフは署名付きカードのため、通常のトレーディングカードとは異なる代理入力料金・事務手数料・送料保険料を設定したいという要望があった。1申込内でオートグラフと通常のトレーディングカードが混在することは実務上想定しない（ユーザー確認済み）ため、混在時の按分ロジックは設けていない。
- 決定:
  - **`ItemType` enumに`AUTOGRAPH`を追加**。`Application.itemType`/`Card`関連のitemType選択には引き続き使わない（選択肢は固定3値配列のまま）が、`PricingSetting.itemType`/`ShippingInsuranceRate.itemType`にオートグラフ専用の行を持てるようにするための追加。
  - **`fee-calculator.ts`の`calculateFees()`に、選択されたサービスタイアの`category`が`AUTOGRAPH`かどうかを判定するロジックを追加**（`cardServiceLevels`指定時は各行、単一`customServiceLevelId`指定時はそのタイア）。判定結果に応じて`flatFeeItemType`（`AUTOGRAPH` or 元の`itemType`）を決定し、`PricingSetting`・送料保険マトリクス/レガシー計算のlookupキーとして使う。これにより代理入力料金・事務手数料・送料保険料（無料化しきい値含む）がオートグラフ専用設定に切り替わる。
  - **管理画面の料金設定ページで、オートグラフのセクションをPSA US配下の「トレーディングカード」と「未開封パック」の間に配置**し、他のアイテム種別と同じ3部構成（サービス料金・代理入力料金＋事務手数料・送料保険料）で表示。従来の独立した「オートグラフ（デュアルサービス）料金」セクションは廃止し、この中に統合した。
  - **`pricing.ts`の`itemTypeEnum`・`HandlingFeeForm`/`ShippingInsuranceForm`の`itemType`プロパティ型に`AUTOGRAPH`を追加**し、既存のフォームコンポーネントをそのまま再利用。
  - **`seed.ts`に`PricingSetting`の`PSA_US_AUTOGRAPH`行を追加**（`PSA_US_UNOPENED_PACK`等と同じプレースホルダーパターン）。
  - `ApplyForm.tsx`/`StoreRequestForm.tsx`の`Record<ItemType, ...>`型のラベルマップ（網羅性が必要）に、表示には使わないプレースホルダーとして`AUTOGRAPH`エントリを追加。
- 影響: `prisma/schema.prisma`の`ItemType` enumに`AUTOGRAPH`を追加（db push、非破壊の追加）。`calculateFees()`の内部ロジック変更のみでシグネチャは変更なし。
- 未対応: 1申込内でオートグラフと通常のトレーディングカードが混在するケースの按分は未対応（想定外のため）。混在が発生した場合の実際の挙動は、その申込に含まれるいずれかのタイアが`AUTOGRAPH`であれば申込全体をオートグラフ専用設定で計算する（`isAutographSelected`が一度でも`true`になれば以降falseに戻らない実装のため）。

## ADR-0044: 「代理申込（要対応）」一覧に、顧客の支払い完了までは未払いの申込を残す

- 日付: 2026-07-08 / 状態: Accepted（実装済）
- 背景: ADR-0042で確定分請求の自動課金を廃止し、顧客がマイページで能動的に支払う方式に変更した結果、`getStoreRequests()`（「代理申込（要対応）」一覧のデータ取得）が`status: "DRAFT"`のみを対象としていたため、スタッフが明細入力・確定した時点（`status`が`SUBMITTED`に変わる）で一覧から消えてしまい、顧客の支払いが完了していない申込を追跡できなくなっていた。
- 決定:
  - **`getStoreRequests()`の`where`条件を、`status: "DRAFT"`（入力待ち）または`status: "SUBMITTED"`かつ確定分請求の`Payment`が`PENDING`（未払い）のいずれかに一致するよう変更**。顧客の支払いが完了（`Payment.status`が`SUCCEEDED`）すると、どちらの条件にも一致しなくなり一覧から自然に外れる。
  - 返り値に`awaitingPayment: boolean`（`status === "SUBMITTED"`）を追加。
  - **`admin/store-requests/page.tsx`に「状態」列を追加**し、`awaitingPayment`に応じて「未払い」（赤）／「入力待ち」（黄）のバッジを表示。操作列も、未払いの場合は`/admin/applications/[id]`（申込詳細で内容確認）への「確認する」リンクに、入力待ちの場合は従来通り`/admin/store-requests/[id]`への「入力する」リンクに切り替える。
- 影響: `getStoreRequests()`の返り値に`awaitingPayment`フィールドを追加（呼び出し元は`admin/store-requests/page.tsx`のみ）。スキーマ変更なし。
- 未対応: `admin/store-requests/[id]/page.tsx`（明細入力画面）自体は変更していない。未払い状態のアプリをこのURLに直接アクセスした場合、既存の`alreadyDone`分岐により「この代理申込は対応済みです」という簡易メッセージが表示される（支払い状況の詳細は表示しない）。

## ADR-0045: 顧客向け簡易ステータスの段階を拡張（自己入力／代理入力で別系統に）

- 日付: 2026-07-08 / 状態: Accepted（実装済）
- 背景: 従来の`computeDisplayStatus()`は「申込完了→受取完了→発送完了→カスタムのPSA進捗ステータス」の4段階のみで、(a) PSA提出グループを作成したがまだ提出（発送）していない状態、(b) 鑑定完了後にカードを顧客へ返送する準備・完了の状態、が区別できなかった。また代理入力（STORE）は「受取」という概念が明細入力（お預かり時点）に事実上含まれるため、自己入力と同じ「受取完了」を出すのは実態に合わず、代わりに「入力完了」「支払完了」（確定分請求の支払い状況）を出したいという要望があった。
- 決定:
  - **`computeDisplayStatus()`の段階を拡張**。共通の後半部分（最も進んだ状態から判定）: 返送完了 → 返送準備中 → カスタムのPSA進捗ステータス → 発送完了 → 発送準備中（PSA提出グループ作成済み・未提出）。ここまでで該当しなければ、`source`に応じて前半部分を分岐:
    - 自己入力(CUSTOMER): 受取完了（`receivedAt`あり）→ 申込完了
    - 代理入力(STORE): 支払完了（確定分請求のPENDINGな`Payment`が無い＝差額なし or 支払済み）→ 入力完了（この関数はstatusがDRAFTでない前提で呼ばれるため、代理入力は必ず「入力完了」以上になる。「受取完了」は出さない）
  - **返送準備中／返送完了は、そのカード群の`Card.status`が全て`READY_FOR_CUSTOMER_RETURN`／`RETURNED_TO_CUSTOMER`の場合のみ**判定する（一部のカードのみ進んでいる混在時は、より手前の判定にフォールバックする）。
  - 関数のシグネチャに`source`・`payments`（`status`のみ）・`cards`（`status`のみ）を追加。呼び出し元（`mypage/applications/page.tsx`の`getMyApplications()`は既にこれらのフィールドを取得済みのためクエリ変更不要。`admin/applications/page.tsx`は`cards`・`payments`のselectを追加）。
  - 両呼び出し元のステータスバッジ色マップ（`STATUS_BADGE_CLS`）に新しい段階名を追加（入力完了=インディゴ、支払完了=シアン、発送準備中=オレンジ、返送準備中=ティール、返送完了=グリーン）。
- 影響: `lib/application-status.ts`の`computeDisplayStatus()`のシグネチャ変更（破壊的）。呼び出し元は2箇所のみ（`mypage/applications/page.tsx`・`admin/applications/page.tsx`）で、いずれも対応済み。スキーマ変更なし。
- 未対応: 1申込内でカードの返送進捗が混在するケース（一部のみ返送準備中など）の個別表示は行わない（全カードが揃った時点でのみ段階が進む）。

## ADR-0046: 代理申込の差額決済で、保存カードのワンクリック支払いを廃止しカード入力に統一

- 日付: 2026-07-08 / 状態: Accepted（実装済）
- 背景: ADR-0042で実装した`DifferentialPaymentPanel`の「保存済みカードでワンクリック支払い」経路は、`window.Stripe`を参照するだけでStripe.jsのスクリプト自体を読み込んでおらず（`StripeCardPayment.tsx`側のuseEffectでしか読み込まれないため、保存カード経路では実行されない）、実際に押すと「Stripe.js の読み込みに失敗しました」で必ず失敗するバグがあった。また、保存済みカードを自動的に使い回すのではなく、顧客が支払いのたびにカード情報を入力し直せるようにしたいという要望があった。
- 決定:
  - **`DifferentialPaymentPanel.tsx`から保存カードのワンクリック支払い経路を削除**し、常に既存の`StripeCardPayment.tsx`（カード入力欄＋`confirmCardPayment`）を使う一本の経路に統一。これによりStripe.js読み込みバグも解消される（`StripeCardPayment.tsx`は初回代理入力先払い等で実績のある読み込み処理を持つため）。
  - **`actions/payment.ts`の`createDifferentialPaymentIntent()`から、保存済みデフォルトカードの取得・PaymentIntentへの事前アタッチ（`paymentMethodId`）を削除**。返り値から`savedCard`も削除。
  - **`lib/stripe.ts`の`createPaymentIntent()`から未使用になった`paymentMethodId`引数を削除**（呼び出し元がこの用途のみだったため）。
- 影響: `DifferentialPaymentPanel.tsx`・`actions/payment.ts`・`lib/stripe.ts`の3ファイルのみ。`chargeOffSession()`（`createUpcharge`が使用）の`paymentMethodId`引数とは別物で影響なし。スキーマ変更なし。
- 未対応: 特になし。

## ADR-0047: 顧客向けページ共通フッターを新設

- 日付: 2026-07-10 / 状態: Accepted（実装済）
- 背景: 利用規約・個人情報保護方針等の重要ページへの導線が、認証画面（`AuthScreen`）下部の小さな注記リンク以外になく、サイト全体で一貫したフッターが存在しなかった。
- 決定:
  - **`src/components/Footer.tsx`を新設**。ロゴ＋著作権表記（左）とリンク（利用規約・個人情報保護方針。右）を横並びで配置するレイアウト（モバイルでは縦積み）。
  - 顧客向けページ全体で共有レイアウトが存在しない（`CustomerHeader`と同様、各ページが個別にヘッダーを描画する既存の構成。`src/app/layout.tsx`はチュームを持たない素のシェル）ため、`CustomerHeader`と同じ「ページごとに配置する」方式を踏襲し、`AuthScreen.tsx`（`/`・`/login`・`/register`の未トークン時をカバー）・`terms`・`privacy`・`mypage`（トップ）・`register`（無効トークン時の画面）にそれぞれ`<Footer />`を追加。
  - 管理画面（`/admin/**`）は独自のサイドバーシェル（`admin/layout.tsx`）を持ち、顧客向けコンポーネントを一切参照しないため、意図せずフッターが混入することはない。
- 影響: 新規コンポーネント1件＋顧客向け5ファイルへの追加のみ。スキーマ変更なし。
- 未対応: 特定商取引法に基づく表記ページ・会社概要／お問い合わせページは未作成のため、フッターにはリンクを含めていない（必要な場合は別途ページ作成と事業者情報の確定が必要）。`mypage`配下の個別ページ（申込一覧・設定等のサブページ）には追加していない（トップページのみ）。

## ADR-0048: 保存済みカードの重複バグ修正＋Stripe.js読み込みの共通化＋保存カードでの支払いを復活

- 日付: 2026-07-10 / 状態: Accepted（実装済）
- 背景: マイページ「保存済みカード」に、実質同じカード（同一ブランド・下4桁・有効期限）が何件も重複登録される不具合が報告された。原因は、決済成功時にカードを保存する4箇所（Stripe Webhookの`payment_intent.succeeded`・`payment_method.attached`、`confirmApplicationPayment`、`confirmDifferentialPayment`）すべてが、重複判定を`stripePaymentMethodId`の一致のみで行っていたこと。カード番号を毎回入力し直すフロー（ADR-0046）では、同じカード番号を入力してもStripeはその都度新しい`PaymentMethod`オブジェクト（新しい`pm_xxx`）を発行するため、`stripePaymentMethodId`は常に異なり、重複判定が機能していなかった。あわせて、ADR-0046で一度廃止した「保存済みカードでのワンクリック支払い」を復活してほしいという要望があった（廃止理由だった「Stripe.jsを読み込んでいなかった」バグを、今回は正しく修正した上で）。
- 決定:
  - **保存判定を「ブランド・下4桁・有効期限（＋顧客ID）」のカード指紋ベースに変更**。4箇所すべて（`webhook/route.ts`の2ハンドラ、`confirmApplicationPayment`、`confirmDifferentialPayment`）を同じ判定に統一。
  - **`actions/payment.ts`に`dedupeSavedPaymentMethods()`を新設**し、既存の重複行を1件（既定カード優先、無ければ最古）に整理する（Stripe側もbest-effortでdetach）。`mypage/settings/page.tsx`の一覧表示前に自動実行し、ユーザー操作なしで既存の重複を解消する。
  - **`src/lib/stripe-client.ts`を新設**し、Stripe.jsの遅延読み込みロジック（スクリプトタグ挿入・多重読み込み防止・タイムアウト処理）を一箇所に共通化。今回の「保存済みカードのワンクリック支払い」バグ（Stripe.js自体を読み込んでいなかった）のような読み込み忘れの再発を防ぐため、`StripeCardPayment.tsx`・`ApplyForm.tsx`・`DifferentialPaymentPanel.tsx`の3箇所すべてをこの共通ユーティリティ経由に統一（`ApplyForm.tsx`が独自に持っていた`declare global`とローカル型定義は削除）。
  - **`DifferentialPaymentPanel.tsx`に保存済みカードでのワンクリック支払いを復活**。`createDifferentialPaymentIntent(applicationId, useSavedCard)`が既定カードを事前アタッチしたPaymentIntentを返し、クライアントは共通ユーティリティで読み込んだStripe.jsで`confirmCardPayment(clientSecret)`のみで支払える。「別のカードを使う」を選ぶと`useSavedCard=false`で作り直した（事前アタッチなしの）PaymentIntentに切り替わり、`StripeCardPayment`でカードを新規入力できる。
- 影響: `lib/stripe.ts`の`createPaymentIntent`に`paymentMethodId`引数を再追加（ADR-0046で一度削除したもの）。`actions/payment.ts`・`actions/application.ts`（`confirmApplicationPayment`・`confirmStorePrepayPayment`の2箇所）・`src/app/api/stripe/webhook/route.ts`（2ハンドラ）・`ApplyForm.tsx`・`StripeCardPayment.tsx`・`DifferentialPaymentPanel.tsx`を変更。スキーマ変更なし。
- 未対応: 既存の重複行の自動整理は`mypage/settings`ページを開いたタイミングでのみ実行される（バックグラウンドジョブ等での一括整理は行っていない）。

## ADR-0049: 代理申込の申込詳細に「お支払い済みの料金」内訳を表示

- 日付: 2026-07-10 / 状態: Accepted（実装済）
- 背景: 代理申込は「先払い（概算の代理入力料金）→ 明細確定 → 差額請求」という2段階の支払いになるが、顧客が申込詳細ページを見ても、確定後の合計内訳（鑑定料・代理入力料金・送料保険料・事務手数料）と「これから支払う差額」しか表示されず、**そもそも先払いでいくら払ったのか**が分からなかった。
- 決定:
  - **`mypage/applications/[id]/page.tsx`に「お支払い済みの料金」セクションを追加**（`source=STORE`のみ）。`Application.payments`のうち最初に成立した`SUCCEEDED`な`Payment`（＝先払い）を特定し、その支払日時・`Application.agencyQuantity`（先払い時に申告した代理入力数）・単価（`prepaidAmount / agencyQuantity`から逆算）・合計（`prepaidAmount`）を「{日時}　代理入力料金　{件数}件×{単価}　{合計}」の形式で表示する。
- 影響: `mypage/applications/[id]/page.tsx`のみ変更。新規クエリ・スキーマ変更なし（既存の`getApplicationDetail()`が返す`payments`・`agencyQuantity`・`prepaidAmount`から算出）。
- 未対応: 単価は`prepaidAmount ÷ agencyQuantity`の逆算値であり、`PricingSetting.proxyFee`が先払い後に変更された場合でも先払い時点の実額を正しく表示する（意図した挙動）。

## ADR-0050: 代理申込の申込詳細ページをカード確認優先のレイアウトに再構成

- 日付: 2026-07-10 / 状態: Accepted（実装済）
- 背景: 代理申込（`source=STORE`）は当社スタッフがカード明細を入力するため、顧客はまず「入力された内容が正しいか」を確認する必要があるが、従来のレイアウトはカード一覧がページ最下部にあり、確認すべき内容よりも先に請求額だけが目に入る構成だった。また鑑定料の内訳が単一の合計額のみで、代理申込は複数のサービスレベルが混在しうるにもかかわらずその内訳が分からなかった。
- 決定:
  - **`source=STORE`の場合のみ、カード一覧セクションをページ最上部（ヘッダー直下）に移動**。自己入力（`source=CUSTOMER`）は従来通りページ最下部のまま（自分で入力した内容の再確認は優先度が低いため）。
  - **代理申込のカード一覧の各行に、サービスレベル名・枚数・申告額を追加表示**（`Card.customServiceLevelName`・`declaredValue`から。自己入力では表示しない）。見出しの下に「代理入力していただいた内容をご確認ください。」という案内文を追加。
  - **鑑定料をサービスレベルごとの内訳に分解して表示**（`Card.psaFee`・`quantity`を`customServiceLevelName`でグルーピング）。ApplyForm.tsxの「申込内容の確認」ステップと同じ「鑑定料（レベル名） 単価×枚数」の表示形式に統一。自己入力は元々1レベルのみのため、この分解ロジックは自然に1行に収束する（分岐不要）。
  - **代理入力料金の内訳表示に「件数×単価」を追加**（確定済みのカード種類数＝`application.cards.length`を使用。ADR-0049で追加した「お支払い済みの料金」欄の見積り時点の件数とは別に、確定後の実際の件数を表示する）。
  - 「申込概要」の見出しは`source=STORE`の場合「請求内容の確認」に変更（自己入力の確認・同意UIに近い体裁を意図）。
- 影響: `mypage/applications/[id]/page.tsx`のみ変更。新規クエリ・スキーマ変更なし。
- 未対応: 「利用規約への同意」チェックボックスのような同意UIそのものは追加していない（代理申込は依頼時点で既に同意済みのため、確認表示のみで足りると判断）。

## ADR-0051: PSA提出グループの提出情報を「PSA Submission ID / Order ID」から「提出先・アイテム種別・サービスレベル・申込番号(Sub#)」に変更

- 日付: 2026-07-10 / 状態: Accepted（実装済）
- 背景: PSA提出グループの提出時入力は、PSAが発行する2つの自由記述ID（Submission ID / Order ID）を記録するだけで、そのグループが実際にどのPSAサービス（提出先リージョン・アイテム種別・サービスレベル）に対する提出なのかを構造化して記録していなかった。運用上、提出先・アイテム種別・サービスレベルの組み合わせで管理したいという要望があり、Order IDは実運用で使われていなかった。
- 決定:
  - **`PsaSubmissionGroup`に`region`（`ServiceRegion?`）・`itemType`（`ItemType?`）・`customServiceLevelId`/`customServiceLevelName`（`String?`、Application/Cardと同じスナップショット方式）を追加**。既存の`psaSubmissionId`はそのまま「申込番号（Sub#）」として使い続ける。
  - **`psaOrderId`列は削除せず残置**（破壊的変更を避けるため。ADR-0021由来の既存データ保持）が、新しい提出フォーム・一覧表示からは参照しない（未使用として扱う）。
  - **`SubmitGroupForm.tsx`を全面差し替え**: PSA Submission ID/Order IDのテキスト入力2つを廃止し、「提出先」（PSA日本/PSA US選択）→「アイテム種別」（PSA日本は常にトレーディングカード固定、PSA USはトレーディングカード/未開封パック/コミック・マガジンから選択）→「サービスレベル」（選択した提出先・アイテム種別で`CustomServicePrice`を絞り込んだセレクト。ApplyForm.tsxの`tierOptionsToShow`と同じフィルタロジック）→「申込番号（Sub#）」の4項目+提出日に変更。
  - `submitPsaGroup`にzodバリデーションを追加（`region`/`itemType`/`customServiceLevelId`/`customServiceLevelName`/`psaSubmissionId`/`submittedAt`必須）。
  - グループ一覧（`admin/psa-groups/page.tsx`）の表示も同じ4項目+提出日に変更。
- 影響: `prisma/schema.prisma`（`PsaSubmissionGroup`にカラム追加のみ、非破壊）、`src/actions/admin.ts`、`src/app/admin/psa-groups/page.tsx`、`src/app/admin/psa-groups/SubmitGroupForm.tsx`。Google Drive上の開発環境では`prisma db push`が実行できないため、本番Railwayの`npm start`（`prisma db push --accept-data-loss && next start`）実行時に自動反映される。
- 未対応: 既存の`PREPARING`以外（`SUBMITTED`以降）のグループは`region`/`itemType`/`customServiceLevelName`が`null`のまま（表示は「—」）。過去分の遡及入力機能は未実装。

## ADR-0052: 簡易ステータス（`computeDisplayStatus()`）の固定値を`DISPLAY_STATUS`定数として明文化

- 日付: 2026-07-10 / 状態: Accepted（実装済）
- 背景: 顧客画面・管理画面共通で使う「簡易ステータス」（申込完了／受取完了／発送準備中／発送完了／返送準備中／返送完了等）は、`computeDisplayStatus()`関数の分岐内にインラインの文字列リテラルとして散在しており、正式な一覧としてコード上に定義されていなかった。人間が意図した正しいフロー（自己入力: 下書き→申込完了→受取完了→発送準備中→発送完了→カスタムのPSA進捗ステータス→返送準備中→返送完了／代理入力: 申込完了→入力完了→支払完了→発送準備中→発送完了→カスタムのPSA進捗ステータス→返送準備中→返送完了、代理入力は発送準備中以降は自己入力と共通フローに合流）を再確認し、コード上の正式な定数として固定する必要があった。
- 決定:
  - **`src/lib/application-status.ts`に`DISPLAY_STATUS`定数（`as const`オブジェクト）を追加**し、`DRAFT`/`APPLIED`/`RECEIVED`/`INPUT_DONE`/`PAID`/`PREPARING_SHIPMENT`/`SHIPPED`/`RETURN_PREPARING`/`RETURNED`の9つのキーに日本語ラベルを割り当てた。`DRAFT`（下書き）は`computeDisplayStatus()`自体が返す値ではない（呼び出し元が`status==="DRAFT"`を個別に扱う既存設計を維持）が、フロー全体を示す定数として含めた。
  - `computeDisplayStatus()`の戻り値の型を`string`から`DisplayStatus`（`FixedDisplayStatus | (string & {})`）に変更し、関数内の文字列リテラルをすべて`DISPLAY_STATUS.*`参照に置き換えた（カスタムのPSA進捗ステータス名は管理画面での自由入力のため、固定値には含まれず`string`として扱う）。
  - 分岐系（`CardStatus`の`UPCHARGE_UNPAID`/`UPCHARGE_PAID`/`PROBLEM`/`CANCELLED`）・カード単位の17段階`CardStatus`enum自体は変更していない（対象外）。
- 影響: `src/lib/application-status.ts`のみ変更。`computeDisplayStatus()`の戻り値の実際の文字列（表示内容）に変更はなく、既存の呼び出し元（`mypage/applications/page.tsx`・`admin/applications/page.tsx`・`ApplicationCenter.tsx`のStatusBadge等）は`string`を受け取れる箇所のため型変更のみで動作に影響しない。
- 未対応: なし。

## ADR-0053: 管理画面の申込詳細ページに簡易ステータスのステッパーを常時表示

- 日付: 2026-07-10 / 状態: Accepted（実装済）
- 背景: `admin/applications/[id]/page.tsx`（申込詳細）は、`Application.status`（`ApplicationStatus`enum: DRAFT/SUBMITTED/IN_PROGRESS/COMPLETED/CANCELLED）を生のままバッジ表示していたが、`IN_PROGRESS`/`COMPLETED`はコード上どこからも実際にセットされておらず実質未使用で、申込の実際の進捗（受取・発送準備・PSA提出・返送等）を表していなかった。一方、ADR-0052で明文化した`DISPLAY_STATUS`（簡易ステータス）は`admin/applications/page.tsx`の一覧では使われているが、詳細ページには表示されておらず、担当者が申込の進捗を詳細画面で常に確認できる場所がなかった。
- 決定:
  - **申込詳細ページのバッジ表示を`application.status`の生値から`computeDisplayStatus()`の結果（簡易ステータスの現在地）に変更**。DRAFT/CANCELLEDのみ従来通り個別文言（「下書き」/「キャンセル」）を表示。
  - **サマリーカード内に、簡易ステータスのフロー全体を示すステッパー（丸数字＋ラベルの横並び、完了済みは✓・現在地はブランド色でハイライト）を常時表示**。自己入力(`source=CUSTOMER`)は「申込完了→受取完了→発送準備中→発送完了→(カスタムのPSA進捗ステータス)→返送準備中→返送完了」、代理入力(`source=STORE`)は「申込完了→入力完了→支払完了→発送準備中→発送完了→(カスタムのPSA進捗ステータス)→返送準備中→返送完了」の7ステップ。カスタムのPSA進捗ステータス（管理画面で自由入力）が現在地の場合はそのステップにその名称をそのまま表示し、未到達時は「PSA進捗」とプレースホルダー表示する。
  - DRAFT・CANCELLEDの申込ではステッパーを表示しない（フローの対象外のため）。
- 影響: `src/app/admin/applications/[id]/page.tsx`のみ変更。新規クエリ・スキーマ変更なし（既存の`computeDisplayStatus()`が必要とするフィールドは元々`include`済み）。
- 未対応: なし。

## ADR-0054: 提出予約一覧（顧客画面）から、代理入力の支払完了済み申込を除外

- 日付: 2026-07-10 / 状態: Accepted（実装済）
- 背景: `mypage/submission-booking/page.tsx`はADR-0034で「受取完了済み（`receivedAt`セット済み）は既に提出済みのため予約対象から除外」としていたが、これは自己入力(`source=CUSTOMER`)にしか効かなかった。代理入力(`source=STORE`)はカードが既に店舗にある前提（明細入力＝受取を兼ねる。ADR-0034/0045の`computeDisplayStatus()`と同じ考え方）で`receivedAt`が使われないため、支払完了（差額決済含め全額支払済み）後もこの一覧に残り続けてしまっていた。
- 決定:
  - **`applicationsRaw`のクエリに`NOT: { AND: [{ source: "STORE" }, { payments: { none: { status: "PENDING" } } }] }`を追加**。代理入力かつ`PENDING`な決済が無い（＝`computeDisplayStatus()`が「支払完了」を返す状態）の申込を除外する。
  - 自己入力側の`receivedAt: null`条件は変更なし（既に正しく動作しているため）。
- 影響: `src/app/mypage/submission-booking/page.tsx`のみ変更。新規クエリ・スキーマ変更なし。
- 未対応: なし。

## ADR-0055: 顧客向け「お問い合わせ」機能を新設

- 日付: 2026-07-10 / 状態: Accepted（実装済）
- 背景: 顧客が当社へ問い合わせる手段（フォーム）が無く、管理側で受付・回答を一元管理する仕組みも無かった。
- 決定:
  - **`Inquiry`モデルを新設**（`customerId`/`subject`/`body`/`status`(`InquiryStatus`: UNREAD/READ/REPLIED)/`replyText`/`repliedAt`/`repliedBy`）。`Customer`に`inquiries Inquiry[]`を追加。
  - **`/contact`（顧客向け、要ログイン）を新設**。氏名・メールは`getCustomerProfile()`から自動入力（編集不可の読み取り専用表示）、件名・内容を入力。**カスタマーハラスメントポリシー同意・個人情報保護方針同意の2つのチェックボックス**（両方必須、`z.literal(true)`でサーバー側も検証）と、「サブミッション番号の開示、グレード、鑑定の催促に関するお問合せについては回答致しかねます」という注意書きを表示。送信は`createInquiry()`（`src/actions/inquiry.ts`）。
  - **フッター（`Footer.tsx`）に「お問い合わせ」リンクを追加**。全顧客向けページから遷移可能。
  - **管理画面に`/admin/inquiries`（一覧）・`/admin/inquiries/[id]`（詳細＋回答）を新設**。一覧は未読を先頭にソートし件数バッジを表示。詳細を開くと自動的に既読（`READ`）にする（`getInquiryDetail()`）。回答フォーム（`InquiryReplyForm.tsx`）から`replyToInquiry()`を呼ぶと`status`を`REPLIED`にし、顧客へ回答内容をメール送信（`inquiryReplyHtml()`、SMTP未設定時は既存の`sendMail`同様に失敗するが処理は止めない）。サイドバーナビに「お問い合わせ」を追加。
  - メールHTML生成時、顧客が自由入力した`subject`と管理者が自由入力した`replyText`をエスケープする`escapeHtml()`を`mailer.ts`に追加（AGENTS.md §5のHTML埋め込み禁止ルールに従う。他の既存メールテンプレートは対象外）。
- 影響: `prisma/schema.prisma`（`Inquiry`モデル・`InquiryStatus`enum追加、非破壊）、新規ファイル`src/actions/inquiry.ts`・`src/app/contact/`・`src/app/admin/inquiries/`、既存の`src/components/Footer.tsx`・`src/app/admin/layout.tsx`・`src/lib/mailer.ts`を変更。
- 未対応: 顧客がマイページ側で過去の問い合わせ・回答履歴を一覧で見返すUIは未実装（回答はメール通知のみ）。管理者向けの新着問い合わせのサイドバー未読バッジは未実装（一覧ページ内のバッジのみ）。

## ADR-0056: 顧客向け「料金表」ページを新設し、マイページトップにカードを追加

- 日付: 2026-07-10 / 状態: Accepted（実装済）
- 背景: 鑑定料・送料保険料・代理入力料金・事務手数料は管理画面（`/admin/settings`）でのみ確認でき、顧客が事前に料金体系を確認できるページが無かった。
- 決定:
  - **`/contact`と異なりログイン不要の`/pricing`を新設**（料金情報自体は非会員にも案内してよい内容のため）。既存の料金系モデル（`CustomServicePrice`/`PricingSetting`/`ShippingInsuranceRate`/`ShippingRule`/`InsuranceRule`）を読み取り専用で表示する集計ページとして実装し、新規スキーマ・新規Server Actionは追加していない。
  - 表示構成は`admin/settings/page.tsx`と同じ「リージョン（PSA日本/PSA US）× アイテム種別（トレーディングカード/デュアルサービス（オートグラフ）/未開封パック/コミック・マガジン）」の構造を踏襲。各区分ごとに①`CustomServicePrice`によるサービスレベル別鑑定料表、②`PricingSetting`による代理入力料金・事務手数料、③送料・保険料（`ShippingInsuranceRate`のマトリクスがあればそれを優先表示、無ければ`ShippingRule`/`InsuranceRule`の旧ロジックにフォールバック表示）を表示する。`fee-calculator.ts`の実際の計算ロジック（`calcShippingInsuranceMatrix`→未設定時`calcShippingInsuranceLegacy`）と同じ優先順位。
  - 金額表示は帯の閾値（`minValue`/`maxAmount`等）はリージョン通貨（`formatMoneyInt(v, region)`）、実際に請求される送料・保険料・事務手数料・代理入力料金は常に円（`formatMoneyIn(v, "JPY")`）で表示（各モデルのコメント「常に円」に合わせた。鑑定料自体は`formatMoney(pricePerCard, region)`でリージョン通貨表示）。
  - **`mypage/page.tsx`の「Quick actions」カードグリッドに「料金表」カードを追加**（`/pricing`へのリンク）。
- 影響: 新規ファイル`src/app/pricing/page.tsx`のみ追加、既存`src/app/mypage/page.tsx`にカード1件追加。スキーマ・Server Action変更なし（既存データの読み取りのみ）。
- 未対応: フッターへのリンクは追加していない（ユーザー指示がマイページのカード化のみだったため）。必要であれば別途追加を検討。

## ADR-0057: 規程文書（利用規約・個人情報保護方針・カスハラポリシー）をDB化し管理画面から編集可能に

- 日付: 2026-07-10 / 状態: Accepted（実装済）
- 背景: `/terms`・`/privacy`・`/harassment-policy`はいずれもJSXに条文をハードコードしており、内容変更・制定日/改訂日の追加にはコード変更とデプロイが必要だった。個人情報保護方針は差し替え、あわせて全規程を管理画面から編集できるようにし、制定日・改訂日を記録したいという要望があった。
- 決定:
  - **`LegalDocument`モデルを新設**（`id`は固定スラッグ`"terms"`/`"privacy"`/`"harassment_policy"`、`title`・`body`（簡易Markdown）・`establishedAt`（制定日・必須）・`revisedAt`（改訂日・任意）・`updatedBy`）。
  - **本文は外部ライブラリを追加せず自前の最小Markdownパーサー`src/lib/legal-markdown.tsx`（`renderLegalMarkdown()`）でJSX化**。対応記法は`#`/`##`/`###`見出し・`* `箇条書き・`**太字**`・空行区切り段落・`---`（区切り線として非表示）のみ。管理画面のテキストエリアでこの記法により編集する。
  - **`src/lib/legal-document-defaults.ts`に3文書の初期値（Markdown化した条文）を用意**。既存の`terms.tsx`（14章30条）・`harassment-policy.tsx`（7セクション）のハードコード文言をそのままMarkdown変換し、`privacy`はユーザー提供の新テキスト（14条）を採用。`ensureLegalDocument(id)`（`src/actions/legal-document.ts`）が、DBに行が無い場合のみこの初期値を投入する（既存の管理画面編集内容を上書きしない冪等設計。`ensureTradingCardCustomPrices()`と同じパターン）。
  - **`src/components/LegalDocumentView.tsx`を新設**し、`/terms`・`/privacy`・`/harassment-policy`の3ページを`getLegalDocument(id)`→`renderLegalMarkdown()`で描画する薄いラッパーに置き換え。タイトル下に制定日、改訂日があれば併記する。
  - **`/admin/legal-documents`を新設**（サイドバーに「規程管理」を追加）。3文書を`<details>`アコーディオンで一覧し、`LegalDocumentForm.tsx`（タイトル・本文テキストエリア・制定日/改訂日の日付入力）から`updateLegalDocument()`で更新する。
- 影響: `prisma/schema.prisma`（`LegalDocument`モデル追加、非破壊）。新規: `src/actions/legal-document.ts`・`src/lib/legal-markdown.tsx`・`src/lib/legal-document-defaults.ts`・`src/components/LegalDocumentView.tsx`・`src/app/admin/legal-documents/`。置き換え: `src/app/terms/page.tsx`・`src/app/privacy/page.tsx`・`src/app/harassment-policy/page.tsx`（表示内容は既存と同等、privacyのみ内容差し替え）。`src/app/admin/layout.tsx`にナビ追加。
- 未対応: Markdown記法は独自の最小サブセットのみ（表・リンク・ネストしたリスト等は非対応）。本文の変更履歴（誰がいつ何を変えたか）は`OperationLog`の`after`にタイトルのみ記録され、差分そのものは保存していない。

## ADR-0058: 規程文書に改訂日の複数記録・フッター表示ON/OFF・管理画面からの新規作成/削除を追加

- 日付: 2026-07-10 / 状態: Accepted（実装済）
- 背景: ADR-0057で規程文書をDB化したが、`revisedAt`は単一の日付（上書き）で複数回の改定履歴を表せなかった。全文スナップショットの変更履歴までは不要という判断のもと、改訂日だけを複数回分記録できればよいとの要望があった。あわせて、利用規約・個人情報保護方針・カスタマーハラスメントポリシー以外の規程（例: 特定商取引法に基づく表記等）を管理画面から追加・削除し、フッターへの表示有無を切り替えたいという要望があった。
- 決定:
  - **`LegalDocument.revisedAt`を`DateTime?`から`DateTime[] @default([])`に変更**（型変更のため事前にユーザー確認済み。当時全文書の改訂日は未設定=空のため実質データ損失なし）。本文・タイトルのスナップショットは保持せず、日付のみを配列で保持する。
  - **`LegalDocument.showInFooter Boolean @default(true)`を追加**。フッターは`getFooterLegalDocuments()`（`showInFooter=true`のみ・制定日昇順）で取得した文書と固定リンク（お問い合わせ）を結合して表示する、DB駆動の構成に変更。
  - **`createLegalDocument()`/`deleteLegalDocument()`を追加**。新規作成はスラッグ（`/^[a-z0-9][a-z0-9-]*$/`、URLにそのまま使用）・タイトル・制定日を入力し、本文はプレースホルダーで作成後に編集する。削除は`LEGAL_DOCUMENT_DEFAULTS`に無いスラッグ（=管理画面から作成した文書）なら完全に削除され、既定3文書（terms/privacy/harassment_policy）を削除した場合は次回参照時に`ensureLegalDocument()`が初期値を再投入する（意図的な仕様。誤操作からの復旧を兼ねる）。
  - **`/legal/[id]`を新設**し、既定3文書以外（管理画面から新規作成した文書）の公開ページとして使う。既定3文書は従来通り`/terms`・`/privacy`・`/harassment-policy`の専用ルートを維持（`legalDocumentPath()`で振り分け）。
  - **`Footer.tsx`を非同期のServer Componentに変更**したことに伴い、`"use client"`な`AuthScreen.tsx`が内部で直接`<Footer />`をimportして描画していた箇所を修正。`AuthScreen`に`footer?: ReactNode`propを追加し、呼び出し元のServer Component（`src/app/page.tsx`・`src/app/login/page.tsx`・`src/app/register/page.tsx`）から`footer={<Footer />}`として渡す形に変更（Client ComponentはServer Componentを直接importできないため。`/login`にも`force-dynamic`を追加）。
  - **管理画面の「規程管理」に新規作成フォーム・削除ボタン・フッター表示チェックボックス・改訂日の追加/削除UI（バッジ＋×ボタン）を追加**。
- 影響: `prisma/schema.prisma`（`revisedAt`型変更・`showInFooter`追加）、`src/actions/legal-document.ts`、`src/components/Footer.tsx`（非同期化）、`src/components/AuthScreen.tsx`・`src/app/page.tsx`・`src/app/login/page.tsx`・`src/app/register/page.tsx`（footer prop化）、`src/components/LegalDocumentView.tsx`（revisedAt表示を配列対応）、新規`src/app/legal/[id]/page.tsx`・`src/app/admin/legal-documents/NewLegalDocumentForm.tsx`。
- 未対応: 新規作成したスラッグのリネーム機能は無い（削除して作り直す運用）。フッターの表示順は`sortOrder`のような明示的な並び替えフィールドを設けず、制定日の昇順固定。

## ADR-0059: 管理画面サイドバーの表示名・並び順をDB化し、設定画面から編集可能に

- 日付: 2026-07-10 / 状態: Accepted（実装済）
- 背景: サイドバーの「設定」項目は実際には料金関連の設定（サービス料金・代理入力料金・送料保険マトリクス等）がほとんどで、ページ自体の見出しも既に「料金設定」だったにもかかわらず、サイドバーのラベルだけ「設定」のままで不一致だった。あわせて、サイドバー項目の並び順を今後も自由に変えたいという要望があった。
- 決定:
  - **`AdminNavItem`モデルを新設**（`id`はhrefベースの固定キー、`label`・`sortOrder`のみDBで管理）。href・アイコンは`src/lib/admin-nav-defaults.ts`の`ADMIN_NAV_DEFAULTS`にコード側で固定し、ルーティングやアイコン変更は開発者が行う（誤って存在しないパスに向けられる事故を防ぐため、URLは管理画面から編集不可）。
  - **`ensureAdminNavItems()`は項目単位の差分投入**（`ensureLegalDocument()`と同じ考え方）。既存の`label`/`sortOrder`は上書きせず、コード側に新しいナビ項目が追加された場合のみDBに補完する。
  - **`admin/layout.tsx`のハードコードされた`navItems`配列を`getAdminNavItems()`に置き換え**。
  - **`/admin/settings`（サイドバーのラベルを「設定」→「料金設定」に変更）に「サイドバー表示順」セクションを追加**。`AdminNavOrderForm.tsx`で各項目のラベル・表示順（数値）を編集し、`updateAdminNavItems()`で一括保存する（既存の`PsaProgressStatusForm`と同じ「表示順を数値で入力」方式。ドラッグ&ドロップは採用しない）。
- 影響: `prisma/schema.prisma`（`AdminNavItem`モデル追加、非破壊）。新規: `src/actions/admin-nav.ts`・`src/lib/admin-nav-defaults.ts`・`src/app/admin/settings/AdminNavOrderForm.tsx`。既存: `src/app/admin/layout.tsx`・`src/app/admin/settings/page.tsx`。
- 未対応: なし。

## ADR-0060: 規程文書に`footerLabel`（フッター用の短い表記）を追加

- 日付: 2026-07-11 / 状態: Accepted（実装済）
- 背景: ADR-0057でFooter.tsxをDB駆動にした際、フッターのリンク文言に`LegalDocument.title`（ページ見出し・ブラウザタブ用の正式名称、例:「トレカビンクス PSA鑑定代行サービス利用規約」）をそのまま流用してしまい、以前ハードコードされていた短い表記（「利用規約」等）より長くなって収まりが悪くなる不具合が生じた。
- 決定:
  - **`LegalDocument.footerLabel String?`を追加**（未設定なら`title`にフォールバック）。既定3文書の初期値には短い表記（利用規約／個人情報保護方針／カスタマーハラスメントポリシー）を設定。
  - **`ensureLegalDocument()`を、既存行でも`footerLabel`が`null`の場合だけ既定値で補完するように変更**（新規追加フィールドの後付け補完であり、既存のtitle/body等の編集内容は一切上書きしない）。これにより本番の既存3行も次回アクセス時に自動修正される。
  - **`getFooterLegalDocuments()`は`footerLabel ?? title`を返す**ように変更。管理画面（`LegalDocumentForm.tsx`）にも「フッター表示名」の編集欄を追加。
- 影響: `prisma/schema.prisma`（`footerLabel`列追加、非破壊）、`src/actions/legal-document.ts`、`src/lib/legal-document-defaults.ts`、`src/app/admin/legal-documents/LegalDocumentForm.tsx`・`page.tsx`。
- 未対応: なし。

## ADR-0061: 代理申込のカード入力UIを自己入力（ApplyForm.tsx）と同じ「1件ずつ入力→保存→一覧」方式に統一

- 日付: 2026-07-11 / 状態: Accepted（実装済）
- 背景: `StoreInputForm.tsx`（代理申込のカード明細入力）は、全カードを常時展開した編集ブロックとして縦に並べる方式で、自己入力（`ApplyForm.tsx`）の「1件ずつ入力→保存→コンパクトな一覧」という方式と見た目・操作感が異なっていた。またサービスレベルの「一括設定」ボタンがあったが、代理入力は複数サービスレベルが混在しうる（ADR-0038）ため、カードごとに都度選択させたいという要望があった。
- 決定:
  - **`ApplyForm.tsx`と同じ「draft（入力中の1件）＋cards（保存済み一覧）」の状態管理に変更**。`draft`/`editingIndex`/`saveDraftCard()`/`clearDraft()`/`editCard()`/`deleteCard()`を追加し、旧来の「全カードを`cards`配列としてその場編集」方式を廃止。
  - **サービスレベルの一括設定機能（`bulkServiceLevelId`・「全カードに適用」ボタン）を削除**。サービスレベル選択を入力フォーム（`draft`）自体に組み込み、カードを保存するたびに選択を求める。
  - 保存済み一覧はApplyForm.tsxと同じコンパクトな行表示（タイトル・カード名・枚数・申告額の1行＋編集/削除ボタン）とし、サービスレベル名を行内に表示（カードごとに異なりうるため）。
  - バリデーション（`validateCards()`）に「1件以上必須」のチェックを追加（従来は初期状態で必ず1行存在したため不要だったが、`cards`が空で始まりうるようになったため）。
- 影響: `src/app/admin/store-requests/[id]/StoreInputForm.tsx`のみ変更。Server Action（`saveStoreInputDraft`/`previewStoreApplicationFees`/`completeStoreApplication`）のインターフェースは変更なし（`cards`配列の形は従来と同じ）。
- 未対応: なし。

## ADR-0062: カードに申込内の入力順（`lineNo`）を付与し、店頭提出時の照合に使えるようにする

- 日付: 2026-07-11 / 状態: Accepted（実装済）
- 背景: 提出予約完了ページ（ADR-0061と同日の別修正）で「カードをソフトスリーブ→カードセイバーに入れ、注文ごとにグループ分けして番号通りに並べてご提出」という案内を追加したが、その「番号」に対応するものがシステム側になく、顧客・スタッフの双方が参照できる一意な入力順の番号が必要になった。
- 決定:
  - **`Card.lineNo Int?`を追加**（1始まり、申込内での入力順）。既存カードは`null`のまま（過去分の遡及付番はしない）。
  - **`createApplication()`（自己入力・`application.ts`）と`completeStoreApplication()`（代理入力・`admin.ts`）のカード作成ループを`for...of`から`.entries()`に変更し、`lineNo: i + 1`を設定**。カードの入力順＝配列順＝`lineNo`が一致する。
  - **`ApplyForm.tsx`・`StoreInputForm.tsx`の保存済みカード一覧（入力中・未送信）に丸数字バッジで番号を表示**（配列インデックス+1。確定時にそのまま`lineNo`として保存される）。
  - **申込詳細（顧客`mypage/applications/[id]`・管理`admin/applications/[id]`）のカード一覧にも`lineNo`を表示**。あわせて両ページの`cards`取得クエリに`orderBy: { lineNo: "asc" }`を追加し、常に入力順で表示されるようにした（従来は`createdAt`順または未指定）。
- 影響: `prisma/schema.prisma`（`Card.lineNo`列追加、非破壊）、`src/actions/application.ts`、`src/actions/admin.ts`、`src/app/apply/ApplyForm.tsx`、`src/app/admin/store-requests/[id]/StoreInputForm.tsx`、`src/app/mypage/applications/[id]/page.tsx`、`src/app/admin/applications/[id]/page.tsx`。
- 未対応: 既存（本ADR以前に作成された）カードの`lineNo`は`null`のまま。QRコード印刷（`/api/qrcode`）への番号表示は未対応。

## ADR-0063: 管理画面の申込詳細ページから簡易ステータスのステッパーを削除（ADR-0053の一部差し戻し）

- 日付: 2026-07-11 / 状態: Accepted（実装済）
- 背景: ADR-0053で追加した進捗ステッパー（番号付きの横並びステップバー）が、ステップ数が多い申込（特に代理入力）で横スクロールバーが出てしまい、見た目・使い勝手が良くないという指摘があった。
- 決定:
  - **ステッパーのUI（`progressSteps`の横並び描画）を削除**。`fixedProgressSteps`/`knownDisplayStatusValues`/`isCustomPsaProgress`/`progressSteps`/`currentStepIndex`の算出ロジックも不要になったため削除。
  - **簡易ステータスのバッジ表示（`computeDisplayStatus()`の結果を「受取完了」等のバッジで表示する部分）はそのまま維持**。ADR-0053の「生の`Application.status`ではなく簡易ステータスをバッジ表示する」という変更自体は有用と判断し、ステッパー部分のみを差し戻した。
- 影響: `src/app/admin/applications/[id]/page.tsx`のみ変更。
- 未対応: なし。

## ADR-0064: 提出予約カレンダーを月間表示から週間表示（月曜始まり）に変更

- 日付: 2026-07-11 / 状態: Accepted（実装済）
- 背景: `/admin/submission-bookings`は42セル（6週×7日）の月間グリッドで、各日のセルが狭く予約詳細が表示しきれなかった。週間表示に変更し、日曜始まりではなく月曜始まりにしたいという要望があった。
- 決定:
  - **`makeMonthDays()`（42日パディング）を`makeWeekDays()`（7日、月曜始まり）に置き換え**。`parseWeekStart()`が`?week=YYYY-MM-DD`（週内の任意の日でよい）を月曜0時に正規化する。
  - **`WEEKDAYS`を`["月","火",...,"日"]`に変更**（従来は日曜始まりの`["日","月",...,"土"]`）。
  - 前週・次週ナビゲーションに変更（`?month=YYYY-MM`→`?week=YYYY-MM-DD`）。ヘッダー見出しは「開始日 〜 終了日」の範囲表示（週が月をまたぐ場合は年も併記）。
  - セル数が7つに減った分、日付セルの高さを広げた（`min-h-36`→`min-h-[28rem]`）。月をまたいだ週でも日付が一意に分かるよう、セル見出しを日番号のみから「M/D」表記に変更。
  - 他ページから`?month=`パラメータへの参照は無かったため、リンク切れの影響なし。
- 影響: `src/app/admin/submission-bookings/page.tsx`のみ変更。スキーマ変更なし。
- 未対応: なし。

## ADR-0065: 簡易ステータスのフローを再設計（発送準備中を廃止、返却方法で末尾を分岐、返送系の一括操作を新設）

- 日付: 2026-07-11 / 状態: Accepted（実装済）。ADR-0066で「実体」の設計を訂正（Card.status→PsaSubmissionGroup）。
- 背景: ADR-0036でカード単位の個別ステータス変更UIを廃止して以降、`computeDisplayStatus()`が参照していた`Card.status`の`READY_FOR_CUSTOMER_RETURN`/`RETURNED_TO_CUSTOMER`（返送準備中／返送完了）へ書き込む手段が管理画面のどこにも存在せず、申込ステータスが「発送完了」以降で行き止まりになっていた。あわせて、既存の「発送準備中→発送完了」の2段階（PSA提出グループの作成→提出）は運用上区別する意味が薄く、店頭受取と配送で返却時の呼び方・工程も本来異なる、という指摘があった。ユーザー方針として、**カード単位のステータス管理機能は復活させず、申込単位のステータス管理のみで完結させる**（[[feedback-status-management-scope]]参照）。
- 決定:
  - **「発送準備中」を簡易ステータスから廃止**。PSA提出グループへ**割り当てられた時点**（`createPsaSubmissionGroup`実行時。提出情報《Sub#・提出日等》の記録有無は問わない）で即座に「発送完了」を返すよう`computeDisplayStatus()`を変更（`DISPLAY_STATUS.PREPARING_SHIPMENT`を削除）。グループ自体のPREPARING/SUBMITTED内部ステートやSubmitGroupFormの提出情報記録フローは変更していない（あくまで顧客・管理画面への表示ラベルの簡略化）。
  - **返送以降の2段階を`Application.returnMethod`で分岐**。`STORE_PICKUP`は「④店頭受取可能→⑤店頭受取完了」、`SHIPPING`は「④返送準備中→⑤返送完了」。表示ラベルのみ`returnMethod`で出し分け、実体（何を進捗の根拠にするか）はADR-0066で確定。`DISPLAY_STATUS`に`STORE_PICKUP_READY`/`STORE_PICKUP_DONE`を追加。
  - **新規サーバーアクション`markGroupReturnPreparing`/`markGroupReturned`（`admin.ts`）を追加**。PSA提出グループ単位で一括して④→⑤に進める（カード単位・申込単位の個別操作は提供しない）。PSA提出グループ管理画面（`/admin/psa-groups`）に`ReturnStatusButtons.tsx`として設置。
  - **⑤は必ず④を経由させる**（サーバー側で④未達なら⑤への更新を拒否、UI側でも⑤ボタンを無効化）。グループが未提出（`status==="PREPARING"`）の場合は④⑤とも操作不可（従来の`advanceGroupStatus`と同じガード）。
  - 1グループに`returnMethod`が異なる申込が混在しうるため、`ReturnStatusButtons`のボタン文言は「④受取可能/返送準備中にする」のように両方を併記（グループ単位の一括操作のため申込ごとに文言を出し分けない）。
- 影響: `src/lib/application-status.ts`（`DISPLAY_STATUS`/`computeDisplayStatus()`のシグネチャに`returnMethod`追加・破壊的）、`src/actions/admin.ts`（新規アクション2つ）、`src/app/admin/psa-groups/page.tsx`・新規`ReturnStatusButtons.tsx`、`src/app/admin/applications/page.tsx`・`src/app/mypage/applications/ApplicationCenter.tsx`（バッジ色マップ更新）、`src/app/admin/applications/[id]/page.tsx`（完了系バッジの緑色判定に`STORE_PICKUP_DONE`追加）。
- 未対応: PSA進捗ステータス（③、`advanceGroupStatus`）自体の順序・逆戻り防止バリデーションは引き続き未対応（ADR-0034から持ち越し）。

## ADR-0066: カード単位のステータス管理を全廃止（`Card.status`への書き込みを撤去、④⑤の実体は`PsaSubmissionGroup`に集約）

- 日付: 2026-07-11 / 状態: Accepted（実装済）。ADR-0065を補完・一部訂正。
- 背景: ADR-0065の実装時、④⑤（受取可能/返送準備中・受取完了/返送完了）を`Card.status`（`READY_FOR_CUSTOMER_RETURN`/`RETURNED_TO_CUSTOMER`）の一括更新で実現しようとしたところ、ユーザーから「カードにステータスは割り振らない、申込単位でステータスを管理する」という明確な方針指摘があった。あわせて`Card.status`（`CardStatus`enum、17値）の全使用箇所を監査した結果、**書き込みは常に該当Applicationの全カードへ一括適用されるのみで、同一申込内でカードごとに値が異なることは構造上あり得ず**、`SUBMITTED_BY_CUSTOMER`/`RECEIVED_BY_STORE`/`UPCHARGE_UNPAID`/`UPCHARGE_PAID`はいずれもゲート判定（if文・where句）に一切使われておらず、表示専用の死んだ複製データだったことが判明した（実際のゲートは`Application.status`/`receivedAt`や`Upcharge.status`が担っていた）。
- 決定:
  - **④⑤の実体を`PsaSubmissionGroup`の列に変更**。同モデルには過去の設計（ADR-0021以前、`psaOrderId`と同時期）で追加されたまま未使用だった`returnedAt`列が既に存在しており、これに`returnReadyAt`列を追加してペアにした（`Application`への新規列追加は行わなかった）。`markGroupReturnPreparing`/`markGroupReturned`（`admin.ts`）は`PsaSubmissionGroup`を1回updateするだけになり、カードをループする処理は削除。`computeDisplayStatus()`は`app.psaSubmissionGroup.returnReadyAt`/`returnedAt`を参照する（グループ配下の全申込に共通で適用される。ADR-0021以来、グループの`status`が③の実体になっているのと同じ考え方）。
  - **`Card.status`への書き込みを全廃止**。以下を削除: `application.ts`の`confirmApplicationPayment()`・カード作成時の`status`/`statusHistory`明示指定（`@default(DRAFT)`に委ねる）、`admin.ts`の`markApplicationReceived()`（`RECEIVED_BY_STORE`更新）・STORE入力確定時のカード作成（`SUBMITTED_BY_CUSTOMER`）・`createUpcharge()`（`UPCHARGE_UNPAID`/`UPCHARGE_PAID`。認可の実体は既存の`Upcharge.status`のみで完結）、`app/api/stripe/webhook/route.ts`の3箇所（`SUBMITTED_BY_CUSTOMER`／`UPCHARGE_PAID`／`UPCHARGE_UNPAID`）。呼び出し側のどこからも参照されていなかった`updateCardStatus()`アクション（`admin.ts`）も削除。
  - **カード単位の生ステータス表示を申込単位のバッジに置換**。`admin/dashboard`の「最近のカード」テーブルを「最近の申込」（`computeDisplayStatus()`バッジ）に置換。`mypage/applications/[id]/page.tsx`のカード行から個別ステータスバッジ・「ステータス履歴」（`card.statusHistory`）表示を削除し、ページ上部のサマリーに申込単位の状態バッジを1つ追加。`mypage/page.tsx`の未使用だった`STATUS_LABELS`/`CARD_STATUS_LABELS`定数（死んだコード）も削除。
  - **`CardStatus`enum・`Card.status`列・`CardStatusHistory`モデル自体は削除しない**（`db push`でのデータ消失回避、過去ADRの残置慣例に合わせる）。今後は`Card.status`は常にスキーマ既定値（`DRAFT`）のまま更新されない列として凍結される。
- 影響: `prisma/schema.prisma`（`PsaSubmissionGroup.returnReadyAt`列追加。既存の未使用`returnedAt`は用途確定）。`src/actions/application.ts`・`src/actions/admin.ts`・`src/app/api/stripe/webhook/route.ts`・`src/lib/application-status.ts`・`src/app/admin/psa-groups/{page.tsx,ReturnStatusButtons.tsx}`・`src/app/admin/{dashboard,applications}/page.tsx`・`src/app/mypage/{page.tsx,applications/[id]/page.tsx}`・`src/actions/application.ts`の`getApplicationDetail()`/`getMyApplications()`（`psaSubmissionGroup`のselectに`returnReadyAt`/`returnedAt`追加、`cards.statusHistory`のselect削除）。
- 未対応: `Card.psaGrade`/`psaCertNo`（PSAグレード結果）の表示は本ADRの対象外でそのまま維持（グレード登録機能自体はADR-0021で既に廃止・未使用のフィールド）。

## ADR-0067: 申込詳細ページで「提出予約」を受取後は非表示にし、「PSA提出グループ未割当」を次のアクションとして強調

- 日付: 2026-07-11 / 状態: Accepted（実装済）
- 背景: 申込詳細ページ（`admin/applications/[id]/page.tsx`）は、現物が既に手元にある（自己入力=受取完了後／代理入力=支払完了後）状態でも「提出予約」カードを常時表示しており、この時点では既に意味を持たない情報だった。また「PSA提出グループ」カードは未割当時も「未割当です。」という控えめな表示のみで、担当者が次に何をすべきか（グループへの割り当て）が視覚的に伝わっていなかった。
- 決定:
  - **`hasCardsInHand`判定を追加**（自己入力=`receivedAt`あり／代理入力=`PENDING`な決済なし）。これが真の間は「提出予約」カードを非表示にする。
  - **`hasCardsInHand`かつグループ未割当の場合、「PSA提出グループ」カードをアンバー色でハイライト**（枠線・「次のアクション」バッジ・案内文「受取済みです。PSA提出グループへ割り当ててください。」）。
- 影響: `src/app/admin/applications/[id]/page.tsx`のみ変更。スキーマ・クエリ変更なし。
- 未対応: なし。

## ADR-0068: `/contact`ページに顧客本人の問い合わせ履歴（質問・回答）を表示

- 日付: 2026-07-12 / 状態: Accepted（実装済）
- 背景: 問い合わせへの回答（`replyToInquiry`）は顧客へのメール送信のみで通知しており（SMTP未設定/失敗時は無送信のまま処理続行、ADR-0018と同方針）、顧客側にメール以外で回答を確認する手段が一つも無かった。一方でユーザーは、頻繁な問い合わせ対応（スタッフの負荷）を避けたいため、マイページトップ等に「お問い合わせ」を目立つ導線（クイックアクションのカード）として追加することは望まず、スレッド返信・既読管理などを備えた本格的なチケット管理機能も不要としている。
- 決定:
  - **新規`getMyInquiries()`（`actions/inquiry.ts`）を追加**。顧客本人の問い合わせを`customerId`で絞り込み、新しい順に返す（既存の`Inquiry`モデルは1問い合わせ＝1回答のみで、スキーマ変更なし）。
  - **`/contact`ページ（既存のお問い合わせフォームページ）に、フォームの上へ「これまでのお問い合わせ」セクションを追加**。件名・日時・内容・回答（あれば）・ステータスバッジ（回答待ち／回答済み）を表示する読み取り専用の一覧。**顧客からの追加返信（スレッド化）は不可**（現行スキーマのまま、1問1答を維持）。
  - **導線は変更しない**（`/contact`への入口は引き続きフッターのリンクのみ。マイページトップに新規カード・クイックアクションは追加しない）。既存のお問い合わせフォーム自体もそのまま流用。
  - 送信後の成功画面のボタンを「マイページへ」から「お問い合わせ履歴を見る」（`router.refresh()`）に変更し、送信直後に自分の履歴へ気づけるようにした。
- 影響: `src/actions/inquiry.ts`（新規関数1つ）、`src/app/contact/page.tsx`（履歴セクション追加）、`src/app/contact/ContactForm.tsx`（送信後ボタンの文言・遷移先）。スキーマ変更なし。
- 未対応: 顧客からの追加返信（同一問い合わせへの再質問）は引き続きサポートしない（新規問い合わせとして送信する運用）。


