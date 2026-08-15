# eBay委託販売（問屋型）・輸出システム 実装仕様書

> 対象リポジトリ: `psa-system/`
> 文書版: 0.2（0.1からの事業スキーム転換。[ADR-0078](DECISIONS.md)）
> 作成日: 2026-08-10 / 改訂日: 2026-08-11
> 状態: Draft（実装着手前。Phase 1の個体カード基盤のみ実装済）
> 想定実装者: Claude Code
> 本書の目的: PSA受付ローンチ後に、鑑定済みカードを安全にeBay販売へ接続できる基盤と、eBay APIによる委託販売・輸出販売機能を実装するための仕様を定義する。

---

## 0. 実装者向け重要事項

1. 実装前に必ず `AGENTS.md`、`docs/ARCHITECTURE.md`、`docs/DATABASE.md`、`docs/API.md`、`docs/SECURITY.md`、`docs/DECISIONS.md`（特に[ADR-0077](DECISIONS.md)/[ADR-0078](DECISIONS.md)）を読むこと。
2. 本機能は既存のPSA料金計算、17段階のカード進捗、認証方式、Stripe決済フローを置き換えない。独立した機能領域として追加する。
3. 現在の `Card.quantity` は同一カード複数枚を1行で持てる。eBay出品対象は一品物なので、**出品前に必ず現物1枚＝`Card` 1レコードへ展開されていること**を必須条件とする（Phase 1で実装済み。[ADR-0077](DECISIONS.md)）。
4. 金額は用途別に通貨を明示する。国内の顧客向け精算額はJPY整数、eBay価格はUSDの最小通貨単位またはDecimal相当で扱う。新規実装で `Float` に依存しない。
5. 外部API操作は冪等にする。タイムアウトを失敗と断定せず、eBay側の状態照会後に再試行する。
6. eBayのOAuthトークン、配送先、本人確認情報、輸出証憑は機密情報として扱う。ログへ平文出力しない。
7. 本書に「要事業判断」とある項目は勝手に決めず、設定値または機能フラグとして実装するか、着手前に確認する。
8. 本番APIを使った出品・価格変更・返金・発送登録は外部状態を変更する。Sandboxで検証し、本番切替は管理者の明示操作とする。
9. 現在のworktreeには本仕様と無関係な未コミット変更が存在し得る。上書き・巻き戻しをしない。
10. **本書は0.1版（条件付買取スキーム）から委託販売スキームへ全面改訂されている（[ADR-0078](DECISIONS.md)）。「買取」という語は本書では使わない。旧版の`CardPurchase`/`PurchasePayment`/`ConditionalPurchaseAgreement`等の設計は本書には存在しない。**

---

## 1. 背景と目的

### 1.1 背景

- PSA鑑定受付サービスはまだローンチ前である。
- 独自マーケットプレイスは当面構築しない。
- 既存ECは柔軟性が低く、本機能との在庫・注文連携には使わない。
- 販売チャネルとしてeBayを使用し、出品から注文取得、発送登録までをAPI連携する。
- **顧客の所有物を、当社が委託を受けてeBayへ出品・販売する（委託販売）。** 当社は商品の所有権を取得しない。
- 当社は古物商許可を保有するが、本スキームは「個人からの買取」を行わないため、古物営業法上の買取本人確認義務は基本的に生じない見込みである（要最終確認。§15参照）。

### 1.2 事業スキーム

本機能は「委託販売（問屋型）」として扱う。商法557条以下の問屋営業（自己の名をもって他人のために物品の販売をなすことを業とする者）に相当する構造。

1. カードは委託契約成立後、当社が物理保管する。所有権は一貫して顧客に残る。
2. 当社のeBayアカウントから**当社名義で出品する**（対外的な売主は当社）。
3. eBay購入者との売買契約の当事者は当社であり、購入者から見て当社が売主である。
4. eBay購入者の支払い完了をAPIで確認した時点で、当社は顧客に対し**手数料を差し引いた売上金を精算する義務**を負う（所有権移転は発生しない。購入者への所有権移転は顧客→購入者に直接生じる）。
5. 当社は実際の輸出者として海外購入者へ発送し、輸出証憑を保存する。
6. 出品期間中に売れなかった場合、顧客に「返却」または「再出品」を選択させる。
7. eBay手数料・送料・為替レート・返品時の扱いなど、当社と顧客の間の費用負担・リスク分担は契約書で明示する（詳細は要事業判断。§22参照）。

### 1.3 システム目的

- PSA申込からeBay輸出まで、カード1枚を同一管理番号で追跡できること。
- 顧客所有、当社保管、委託出品、精算、海外販売の時系列を証明できること。
- eBay API操作を管理画面に集約し、Seller Hubとの二重管理を避けること。
- 委託契約、精算金支払い、eBay注文、輸出証憑を相互参照できること。
- PSA受付ローンチをeBay機能の完成待ちにしないこと。

---

## 2. スコープ

### 2.1 MVPに含める

- 現物1枚単位へのカード展開・識別（Phase 1で実装済み）
- 所有者、保管者、保管場所の管理
- PSAグレード・証明番号・出品用画像の管理（Phase 1で実装済み）
- 顧客によるeBay委託販売希望申請
- 当社による出品条件（開始価格・予約価格・委託契約の有効期限）の確認・承認
- 委託販売契約への電子同意（手数料率テーブルの提示を含む）
- eBay OAuth接続
- eBay.comへの固定価格出品
- **オークション形式**、数量1（[ADR-0083](DECISIONS.md)。Buy It Nowは使わない）
- 予約価格（リザーブプライス）の設定、不落札時の自動再出品（委託契約の有効期限内）
- eBay注文取得と支払い完了判定
- 支払済み注文成立時の売上精算計算・精算債務作成
- 精算金の手動銀行振込管理
- 出品期間終了時の「返却」または「再出品」選択
- 発送作業、追跡番号のeBay登録
- eBay返品・返金状態の記録
- 輸出証憑のS3保存・カード単位の紐付け
- APIジョブ、再試行、同期監視、操作ログ
- Sandbox／Production切替

### 2.2 MVPに含めない

- 独自マーケットプレイス
- 顧客間取引
- 当社による買取（所有権移転を伴う取引）
- 顧客が手元に保管するカードの出品
- **eBay固定価格出品（Buy It Now）**（[ADR-0083](DECISIONS.md)。オークション形式のみ対応）
- 複数eBayアカウント
- 複数販売チャネルへの同時出品
- AI自動査定
- 銀行APIによる自動振込
- 会計ソフト自動連携
- 自動翻訳の無審査公開
- 海外返品ラベルの自動購入
- 出品期間終了時の自動値下げ再出品（顧客の都度選択のみ）

---

## 3. 用語

| 用語 | 定義 |
|---|---|
| 委託販売契約 | 顧客が所有するカードについて、当社が自己の名義でeBayへ出品・販売することを委託する契約 |
| 委託予約 | 委託販売契約が有効で、まだeBay出品が開始していない、または支払済み注文がない状態 |
| 成約価格 | eBay購入者が支払いを完了した商品価格。送料・税等との区分を保持する |
| 手数料率 | 成約価格帯ごとに定める、当社が精算時に差し引く手数料の割合（[ADR-0078](DECISIONS.md)） |
| 精算額 | 成約価格から手数料・実費を差し引いた、当社が顧客へ支払うJPY金額 |
| 予約価格（リザーブプライス） | オークションで落札を成立させる最低価格。設定しない場合は開始価格からそのまま落札しうる。顧客が希望し当社が承認する（[ADR-0083](DECISIONS.md)） |
| 実際の輸出者 | 当社名義・責任で商品を国外へ発送し、輸出証憑を保存する当社（問屋として） |
| 個体カード | 数量でまとめていない、証明番号・画像・在庫状態を個別に持つ `Card`（Phase 1で実装済み） |

---

## 4. 役割と権限

### 4.1 顧客

- 自分のカードのみ閲覧できる。
- PSA鑑定結果確認後、返送またはeBay委託販売希望を選択できる。
- 希望開始価格、予約価格、委託契約の有効期限を入力できる。
- 当社提示の出品条件、手数料率テーブル、契約本文へ同意できる。
- 出品後はeBay価格を直接変更できず、変更申請のみ可能。
- 出品中の返送・他者への売却はできない（所有権は自分にあるが、契約上出品中は処分を制限される）。
- 出品期間終了時、「返却」または「再出品」を選択できる。
- 精算成立、支払予定、支払済みを確認できる。
- eBay購入者の氏名、住所、連絡先は閲覧できない。

### 4.2 STAFF

- カードの個体化、画像、PSA結果、保管場所を登録できる（Phase 1で実装済み）。
- 出品下書きの作成、梱包チェック、発送、証憑登録ができる。
- 手数料率テーブル、契約条件、eBay接続設定、返金確定は変更できない。

### 4.3 ADMIN

- STAFFの全操作に加え、出品条件承認、価格変更、取消、返金、精算確定を操作できる。
- 手数料率テーブルの設定ができる。
- eBay OAuth、Business Policy、Inventory Location、Sandbox／Productionを設定できる。
- 金銭に影響する操作には再確認UIを表示する（所有権は移転しないため「所有権移転」の確認UIは不要）。

---

## 5. 業務フロー

### 5.1 PSAローンチ前に整備する基盤（Phase 1で実装済み）

1. 同一カードの数量入力は現行どおり許容する。
2. PSAグレード登録時に、`quantity` グループ行から現物1枚単位（`Card`、`quantity=1`）へ分割する（`registerCardGrade`）。
3. 各個体へ既存の採番ルールで一意な `cardNo` を発行する。
4. PSA証明番号、グレード、画像を個体ごとに登録する。
5. 返送処理と委託販売準備を排他的にする。

### 5.2 委託販売申請

1. 顧客が鑑定済みカード詳細から「eBayで委託販売を申し込む」を選択する。
2. システムが出品可能条件を検証する（§6）。
3. 顧客が希望価格等を入力する。
4. 当社が開始価格・予約価格・出品条件を確認し、適用される手数料率テーブルを提示する。
5. 顧客が本人確認済みであることを検証する（§15の確認結果次第で要否が変わる）。
6. 顧客が契約本文・手数料率へ電子同意する。
7. カードを返送不可・出品準備中にする（所有権は顧客のまま）。

### 5.3 eBay出品

1. STAFFが英語商品情報・画像・PSA情報を確認する。
2. ADMINが最終承認する。
3. 非同期ジョブでInventory Itemを登録する。
4. Offerを作成する。
5. Offerを公開する。
6. Listing IDとURLを保存し、顧客には「出品中」と表示する。

### 5.4 支払済み注文と売上精算

1. Webhookまたは定期同期でeBay注文を取得する。
2. 「注文作成」ではなく「購入者支払い完了」を確認する。
3. 委託契約の有効性を再検証する。
4. DBトランザクションで `ConsignmentSettlement`、精算債務（`SettlementPayment`）を作成する。
5. `Card` の所有状態を `SOLD_TO_BUYER` へ変更する（当社を経由せず顧客→購入者に直接移転したことを記録する）。
6. eBay注文を発送待ちにする。
7. 顧客へ精算金額を通知する。

### 5.5 出品期間終了時（売れ残り）

オークション形式（[ADR-0083](DECISIONS.md)）のため、「1回のオークションサイクル終了」と「委託契約の有効期限到達」を区別する。

1. 1回のオークション（1/3/5/7/10日。運用設定、初期提案7日）が不落札で終了した場合、**委託契約の有効期限内であればジョブが自動的に同条件で再出品する**（顧客への都度確認は不要）。
2. 委託契約の有効期限（`ListingDurationOption.days`）に到達した場合、ジョブが検知し出品を取り下げる。
3. 顧客へ「返却」または「再出品（新しい有効期限で再契約）」の選択を通知する。
4. 「返却」選択時: 返送フローへ回す。
5. 「再出品」選択時: 顧客が開始価格・予約価格等を見直せる導線を用意し、新しい委託契約として再度§5.2から開始する。

### 5.6 発送・輸出

1. 支払済み注文の確認完了を確認する。
2. QR／カード番号／PSA証明番号を照合する。
3. 梱包前画像を保存する。
4. Commercial Invoice等を作成する（当社が実際の輸出者）。
5. 当社名義で発送する。
6. 追跡番号をeBayへ登録する。
7. 輸出許可通知書等をS3へ保存する。
8. 配達完了を同期する。

### 5.7 精算金の支払い

1. 支払済み注文成立時に顧客への精算債務を作成する。
2. 管理画面で振込対象を一覧化する。
3. ADMINが銀行振込後、振込日・参照番号を登録する。
4. 顧客へ精算完了を通知する。

---

## 6. 出品可能条件

以下をすべて満たす場合のみ委託販売申請・出品を許可する。

- `Card.quantity == 1`
- PSA鑑定が完了している
- `psaCertNo` が登録済みかつ重複していない
- `psaGrade` が登録済み
- 表裏の出品用画像が存在する
- 顧客が所有者である
- 当社が物理保管者である
- 保管場所が特定できる
- 顧客の本人確認が完了している（§15の確認結果次第で要否・方式が変わる）
- 返送処理が開始されていない
- 有効な別出品・別委託予約がない
- 盗難・紛争・利用停止等の保留フラグがない

不適格な場合は、顧客向けに不足項目を日本語で表示する。内部状態や機密情報は出さない。

---

## 7. 価格・通貨要件

### 7.1 通貨

- 顧客への精算額: JPY整数
- eBay出品価格: USD
- eBay注文: APIが返す原通貨と金額をそのまま保存
- 円換算値: 使用レート、取得元、取得日時をスナップショット保存

### 7.2 価格・手数料ルール

- 顧客は「希望開始価格」を提示する。
- 当社が最終的なeBayオークション開始価格を承認する。
- **手数料は成約価格帯ごとの段階率テーブル**で管理する（既存の送料・保険マトリクス`ShippingInsuranceRate`と同じ発想。[ADR-0015](DECISIONS.md)/[ADR-0078](DECISIONS.md)）。率は管理画面で設定・改定できる。
- 予約価格（リザーブプライス）はUSDで合意する（任意。設定しない場合は開始価格からの落札を許容）。
- 予約価格に達しない入札では落札が成立しない（eBay側の仕組みにより自動的に保証される。[ADR-0083](DECISIONS.md)）。
- Best Offerは使わない（オークション形式にはない機能。[ADR-0083](DECISIONS.md)）。
- 手数料率テーブルを改定する場合、既存の有効契約には遡及適用しない（契約時点のスナップショットを使うか、改定後契約のみ新率を適用するかは要事業判断。§22）。

### 7.3 禁止事項

- 過去の合意済み契約条件を上書きしない。改定版を追加する。
- 精算額の計算式（成約価格－手数料－実費）をUI・Action外に散在させない。純関数化する（§17.4）。

---

## 8. 状態モデル

### 8.1 委託販売契約

```text
DRAFT
UNDER_REVIEW
AWAITING_CUSTOMER_AGREEMENT
ACTIVE
PRICE_REVISION_PENDING
SOLD
UNSOLD_AWAITING_CUSTOMER_CHOICE
RELISTED
RETURN_REQUESTED
EXPIRED
CANCELLED
SUSPENDED
```

### 8.2 eBay出品

```text
DRAFT
QUEUED
CREATING_INVENTORY_ITEM
CREATING_OFFER
PUBLISHING
ACTIVE
RESERVED
SOLD
WITHDRAWING
WITHDRAWN
ENDED
ERROR
```

### 8.3 所有・保管

所有状態と保管状態は別々に持つ。**所有権は一貫して顧客にあり、当社が所有者になることはない。**

所有状態:

```text
CUSTOMER_OWNED
CONSIGNED
SOLD_TO_BUYER
```

保管状態:

```text
AT_STORE
AT_PSA
IN_RETURN_TRANSIT
HELD_FOR_LISTING
PACKING
IN_EXPORT_TRANSIT
DELIVERED_TO_BUYER
RETURNED_TO_COMPANY
RETURNED_TO_CUSTOMER
```

### 8.4 eBay注文

```text
PAYMENT_PENDING
PAID
SETTLEMENT_PROCESSING
READY_TO_SHIP
SHIPPED
DELIVERED
COMPLETED
CANCEL_PENDING
CANCELLED
RETURN_REQUESTED
RETURNED
REFUND_PENDING
REFUNDED
DISPUTED
```

### 8.5 精算金

```text
NOT_DUE
DUE
PROCESSING
PAID
FAILED
CANCELLED
```

状態変更はServer Actionまたは内部サービス関数に集約し、UIから任意文字列を書き込まない。

---

## 9. データモデル案

名称は実装時に既存命名規則へ合わせて調整可能。ただし責務の統合はしない。

### 9.1 `CardOwnership`（実装済み）

- `id`
- `cardId` unique
- `ownerCustomerId`（問屋型スキームでは常に顧客）
- `status`（`CUSTOMER_OWNED`/`CONSIGNED`/`SOLD_TO_BUYER`。§8.3の所有状態）
- `acquiredAt`
- `updatedAt`

個体分割（`registerCardGrade`）時に個体Cardごと`status=CUSTOMER_OWNED`で自動作成される。`CONSIGNED`/`SOLD_TO_BUYER`への遷移はPhase 2/4で実装する委託契約・精算処理から行う。

### 9.2 `CardOwnershipHistory`（実装済み）

- `id`
- `cardId`
- `fromStatus` nullable
- `fromCustomerId` nullable
- `toStatus`
- `toCustomerId` nullable
- `reason`
- `sourceType`
- `sourceId`
- `changedAt`
- `changedBy`

履歴は物理削除・上書き禁止。個体分割時に`toStatus=CUSTOMER_OWNED`の初期エントリが作成される。

### 9.3 `InventoryLocation`（モデルのみ実装済み。CRUD画面は未実装）

- `id`
- `code` unique
- `name`
- `locationType`
- `isActive`
- `notes`

### 9.4 `CardCustody`（実装済み）

- `id`
- `cardId` unique
- `custodianType`（`COMPANY`/`CUSTOMER`）
- `inventoryLocationId` nullable
- `shelfCode` nullable
- `boxCode` nullable
- `status`（§8.3の保管状態9種）
- `updatedAt`

個体分割時に`custodianType=COMPANY`/`status=AT_STORE`で自動作成される。`inventoryLocationId`等の詳細入力・状態遷移UIはPhase 5（発送・輸出）実装時に追加する。

### 9.5 `ConsignmentAgreement`

出品形式はオークションのみ（[ADR-0083](DECISIONS.md)）。`listingPriceUsdMinor`/`minimumSalePriceUsdMinor`/`allowBestOffer`（固定価格出品前提の旧フィールド名）は下記の通り改称・削除した。

- `id`
- `agreementNo` unique
- `cardId`
- `customerId`
- `status`
- `customerDesiredPriceUsdMinor`
- `startingPriceUsdMinor`（オークション開始価格。旧`listingPriceUsdMinor`）
- `reservePriceUsdMinor` nullable（予約価格。null=リザーブなし。旧`minimumSalePriceUsdMinor`、`allowBestOffer`は削除）
- `listingDurationOptionId`（顧客が選択した`ListingDurationOption`への参照。§9.6b、[ADR-0081](DECISIONS.md)）
- `listingExpiresAt`（`agreedAt` + 選択した`ListingDurationOption.days`で算出・確定値を保存）
- `unsoldAction`（`RETURN` / `RELIST`。出品期限到達時に顧客が選択した結果を記録）
- `unsoldChoiceAt`
- `termsVersion`
- `termsSnapshot`
- `agreedAt`
- `agreedIpAddress`
- `agreedUserAgent`
- `approvedBy`
- `approvedAt`
- `createdAt`
- `updatedAt`

1枚のカードに有効な契約は1件のみ。再出品時は新しい契約を作るか、有効期限を延長して同一契約を使うかは実装時に確定する。

### 9.6 `CommissionRateTier`（実装済み。[ADR-0078](DECISIONS.md)/[ADR-0079](DECISIONS.md)/[ADR-0080](DECISIONS.md)）

- `id`
- `platform`（`SalesPlatform` enum: `EBAY`/`FANATICS_COLLECT`/`GOLDIN`。後2つは現状プレースホルダーで連携未実装）
- `minSaleAmountUsdMinor`
- `maxSaleAmountUsdMinor` nullable（null=上限なし）
- `commissionRate`（%）
- `isActive`
- `sortOrder`
- `updatedAt` / `updatedBy`

既存の`ShippingInsuranceRate`（[ADR-0015](DECISIONS.md)）と同じ「価格帯→率」のマトリクス設計を踏襲する。MVPはUS固定運用のため`region`列は持たない（将来の地域拡張時に追加検討）。管理画面は`/admin/ebay/settings`（ADMINのみ保存可、STAFF閲覧可）。現状は`platform=EBAY`固定で表示・保存し、他プラットフォームはUI上「準備中」表示のみ。

### 9.6b `ListingDurationOption`（実装済み。[ADR-0081](DECISIONS.md)）

- `id`
- `platform`（`SalesPlatform`。§9.6と同様）
- `days`（委託契約の有効期限＝出品維持日数）
- `label`（顧客向け表示名。例:「お試し」）
- `sortOrder`
- `isActive`
- `createdAt` / `updatedAt`

委託契約の有効期限は固定値ではなく、顧客がこの中から選択する。同時に「eBay出品期間」も兼ねる（§7.2/§10.2参照。GTC出品＋当社側で`days`経過時に取り下げ）。管理画面は`/admin/ebay/settings`（`CustomServicePrice`と同じ追加・編集・削除・非表示のCRUD）。初期データは未投入（管理画面から手動登録する運用。提案値: 30日／60日／90日）。

### 9.7 `ConsignmentSettlement`

- `id`
- `settlementNo` unique
- `agreementId`
- `cardId`
- `customerId`
- `ebayOrderId`
- `saleAmountMinor`（成約価格、原通貨）
- `currency`
- `commissionRateApplied`（精算時点の`CommissionRateTier`をスナップショット）
- `commissionAmountMinor`
- `exchangeRateUsed`
- `exchangeRateSource`
- `payoutAmountJpy`（顧客への精算額）
- `triggeredAt`
- `settledAt`
- `paymentDueAt`（配達完了`deliveredAt` + 35日で算出。[ADR-0085](DECISIONS.md)。`settledAt`起点ではない点に注意）
- `cancelledAt`
- `cancellationReason`
- `createdAt`

### 9.8 `SettlementPayment`

- `id`
- `consignmentSettlementId`
- `amountJpy`
- `status`
- `bankReferenceMasked`
- `scheduledAt`
- `paidAt`
- `failedAt`
- `failureReason`
- `processedBy`
- `createdAt`
- `updatedAt`

口座番号等を保存する場合は既存 `crypto.ts` で暗号化する。

> **§9.9以降のプラットフォーム非依存化について（[ADR-0080](DECISIONS.md)）**: 横山の意向により、販売チャネルはeBay限定ではなく将来Fanatics Collect/Goldin等の複数プラットフォームを見据える方針になった（買取機能は引き続き対象外）。そのため以下の`Ebay*`モデルは、Phase 3実装着手時に`Listing`/`Order`/`PlatformAccount`/`Shipment`/`FinancialTransaction`のようなプラットフォーム非依存の名称へ変更し、`platform`列（`SalesPlatform` enum: `EBAY`/`FANATICS_COLLECT`/`GOLDIN`。後2つは現状プレースホルダー）で区別する。本書では実装時期に合わせて更新するまで、当面`Ebay*`表記のまま残す。

### 9.9 `EbayAccount`

- `id`
- `environment` (`SANDBOX` / `PRODUCTION`)
- `ebayUserId`
- `marketplaceId`
- `encryptedRefreshToken`
- `encryptedAccessToken` nullable
- `accessTokenExpiresAt` nullable
- `merchantLocationKey`
- `paymentPolicyId`
- `fulfillmentPolicyId`
- `returnPolicyId`
- `status`
- `lastConnectedAt`
- `lastSyncAt`
- `lastError`
- `createdAt`
- `updatedAt`

MVPでは環境ごとに有効アカウント1件。

### 9.10 `EbayListing`

- `id`
- `agreementId` unique
- `cardId`
- `ebayAccountId`
- `sku` unique
- `inventoryItemId` nullable
- `offerId` nullable unique
- `listingId` nullable unique
- `listingUrl` nullable
- `marketplaceId`
- `categoryId`
- `format`
- `currency`
- `listingPriceMinor`
- `minimumOfferPriceMinor` nullable
- `availableQuantity` default 1
- `status`
- `publishedAt`
- `endedAt`
- `lastSyncedAt`
- `lastErrorCode`
- `lastErrorMessage`
- `createdAt`
- `updatedAt`

### 9.11 `EbayListingRevision`

- `id`
- `ebayListingId`
- `revisionType`
- `before` Json
- `after` Json
- `requestedBy`
- `status`
- `externalRequestId`
- `createdAt`
- `completedAt`

### 9.12 `EbayOrder`

- `id`
- `ebayOrderId` unique
- `ebayAccountId`
- `status`
- `paymentStatus`
- `orderFulfillmentStatus`
- `currency`
- `subtotalMinor`
- `shippingMinor`
- `taxMinor`
- `totalMinor`
- `buyerUsername` nullable
- `shippingAddressEncrypted`
- `paidAt`
- `cancelledAt`
- `createdAtExternal`
- `lastSyncedAt`
- `rawSnapshot` Json
- `createdAt`
- `updatedAt`

`rawSnapshot`には不要な個人情報を無制限に保存しない。保存項目を精査する。

### 9.13 `EbayOrderLine`

- `id`
- `ebayOrderId`
- `ebayListingId`
- `lineItemId` unique
- `sku`
- `quantity`
- `lineItemCostMinor`
- `currency`
- `consignmentSettlementId` nullable unique

MVPではquantityは1のみ受け付ける。異常値は自動発送せず要確認。

### 9.14 `EbayShipment`

- `id`
- `ebayOrderId`
- `fulfillmentId` nullable unique
- `carrierCode`
- `trackingNumber`
- `status`
- `packedAt`
- `shippedAt`
- `deliveredAt`
- `registeredToEbayAt`
- `createdBy`

### 9.15 `EbayFinancialTransaction`

- `id`
- `externalTransactionId` unique
- `ebayOrderId` nullable
- `transactionType`
- `currency`
- `amountMinor`
- `transactionAt`
- `rawSnapshot` Json

### 9.16 `ExportEvidence`

- `id`
- `cardId`
- `ebayOrderId`
- `evidenceType`
- `s3Key`
- `fileName`
- `mimeType`
- `documentDate`
- `exportDeclarationNo` nullable
- `trackingNumber` nullable
- `uploadedBy`
- `createdAt`

### 9.17 `ExternalSyncJob`

- `id`
- `provider` default `EBAY`
- `jobType`
- `dedupeKey` unique
- `targetType`
- `targetId`
- `payload` Json
- `status`
- `attempts`
- `maxAttempts`
- `nextAttemptAt`
- `lockedAt`
- `lockedBy`
- `lastErrorCode`
- `lastErrorMessage`
- `createdAt`
- `completedAt`

---

## 10. eBay API要件

### 10.1 利用API

- OAuth authorization code flow
- Account API: payment／fulfillment／return Business Policy
- Inventory API: Inventory Location、Inventory Item、Offer、Publish、Update、Withdraw
- Taxonomy／Metadata API: categoryとItem Specifics
- Fulfillment API: orders、shipping fulfillment、refund／dispute関連
- Finances API: 利用可能な取引明細・手数料・調整
- Media API: `createImageFromFile`によるeBay側への画像ホスティング（[ADR-0077](DECISIONS.md)）
- Notification APIまたはeBayが提供する通知機構

### 10.2 出品手順

```text
createOrReplaceInventoryItem(sku)
→ createOffer(sku)
→ publishOffer(offerId)
→ listingId保存
```

必須情報:

- SKU
- quantity=1
- condition
- title
- description
- aspects
- imageUrls（eBay Media APIでホストしたURL）
- marketplaceId
- **format=AUCTION**（[ADR-0083](DECISIONS.md)。Sell Inventory APIの`FormatTypeEnum`は`AUCTION`/`FIXED_PRICE`の両方をサポートしており、レガシーTrading APIへの切替は不要と確認済み）
- categoryId
- listing policies
- merchantLocationKey
- 開始価格（USD）
- 予約価格（USD、任意）
- オークション期間（1回あたり7日固定。[ADR-0083](DECISIONS.md)）

### 10.3 API所有権

Inventory APIで作成した出品はPSAシステムを正とし、Seller Hubから変更しない。定期同期でeBay側との差分を検出した場合は、自動上書きせず管理画面に警告する。

### 10.4 注文取得

- Webhook受信後に必ずAPIで注文詳細を再取得する。
- Webhookのpayloadだけで精算を成立させない。
- 定期ポーリングで取りこぼしを回収する。
- `ebayOrderId` と `lineItemId` を一意キーにする。

### 10.5 支払い完了判定

eBay APIの実レスポンスに基づく専用関数を作る。文字列比較を画面・Actionへ散在させない。

```ts
isEbayOrderPaid(order): boolean
```

判定仕様はSandboxレスポンスを確認後、テストfixtureとして固定する。

### 10.6 再試行

- 429、5xx、ネットワークタイムアウトは再試行対象。
- 4xxの入力不備は原則再試行せず要修正。
- 認証エラーは1回だけトークン更新後に再試行。
- Publishのタイムアウト後はOffer／Listing状態を照会し、二重公開を防ぐ。
- 指数バックオフ＋ジッターを使う。

---

## 11. 商品情報・画像

### 11.1 タイトル

基本形:

```text
{year} {title/set} {card name} #{number} {rarity} PSA {grade}
```

eBayの文字数制限に合わせ、次の優先順位で省略する。

1. 発行年
2. TCG／セット
3. カード名
4. カード番号
5. PSAグレード
6. レアリティ
7. 補足語

自動生成後にSTAFF／ADMINの確認を必須とする。

### 11.2 説明文

- 実物画像である旨
- PSA証明番号とグレード
- カード基本情報
- スラブ状態
- 日本から発送する旨
- 追跡・保険・署名条件
- 関税等の扱い
- 返品条件
- 写真で状態を確認する旨

### 11.3 画像

最低限:

- スラブ表面
- スラブ裏面
- PSAラベルが判読できる画像

任意:

- 四隅
- スラブ傷
- 特記事項

**eBayのMedia API（`createImageFromFile`）でeBay側にホストする**（[ADR-0077](DECISIONS.md)）。当社サーバがS3から画像を取得しeBay Media APIへ転送、返ってきたeBay側URLを出品情報に使う。当社S3を公開設定にする必要はなく、CloudFront等の追加公開インフラも不要。

---

## 12. 支払済み注文の精算トランザクション

以下を単一DBトランザクションで実行する。

1. 対象 `EbayOrder`／`EbayOrderLine` をロック相当で再取得。
2. 同じ `lineItemId` に `ConsignmentSettlement` がないことを確認。
3. eBay支払い完了を確認。
4. `ConsignmentAgreement.status == ACTIVE` を確認。
5. 落札額が予約価格以上であることを確認（eBay側でリザーブ未達なら不成立になるため通常は冗長チェックだが、Webhook遅延等に備え念のため検証する）。
6. カードが顧客所有・当社保管中であることを確認。
7. 適用する`CommissionRateTier`を成約額から特定し、手数料額を算出する。
8. `ConsignmentSettlement` を作成（成約額・手数料率・手数料額・為替レート・精算額をスナップショット）。
9. `CardOwnership` を `SOLD_TO_BUYER` へ変更（当社を経由しない）。
10. `CardOwnershipHistory` を追加。
11. `SettlementPayment` を作成。
12. 契約を `SOLD` へ変更。
13. 出品を `SOLD`、注文を `READY_TO_SHIP` へ変更。
14. 既存 `OperationLog` へ要約を記録。

トランザクション完了後に通知・メール・外部API操作を行う。メール失敗で精算成立をロールバックしない。

---

## 13. キャンセル・返品・例外

### 13.1 支払い前キャンセル

- 精算は成立させない。
- 出品または注文状態だけを同期する。

### 13.2 支払い後・発送前キャンセル

初期仕様:

- `CANCEL_PENDING` としてADMIN判断を必須にする。
- 契約条項に基づき取消記録を追加する（所有権は元々顧客のままのため「所有権を戻す」処理は不要）。
- 既存履歴は削除しない。
- 精算金支払済みなら自動取消せず、個別対応とする。

### 13.3 発送後返品

- 経済的所有者は顧客のままのため、返品されたカードは顧客の所有物として扱う。
- **返品時に既に精算済みの場合、顧客へ差額を請求する**（[ADR-0085](DECISIONS.md)。グレサの「精算後キャンセルは差額分を精算させていただきます」と同様の方針）。請求フロー（既存Upchargeの流用可否等）は実装時に確定する。
- 上記リスクを抑えるため、精算金の振込タイミングは配達完了から35日後に設定している（[ADR-0085](DECISIONS.md)）。返品はeBayの標準返品期間30日以内に起きることが多く、原則として振込前に返品の有無が判明する想定。
- 返品カードは当社保管・在庫として一旦受け入れる。
- PSA証明番号と状態を再照合する。
- 再出品可否は顧客の意思＋ADMIN判断。

### 13.4 商品不一致・権利問題

次を通常返品と分けて管理する。

- PSA証明番号不一致
- 顧客が所有者でない
- 盗品・不正取得品
- 申告されていない重大な破損
- eBayポリシー違反

自動で顧客へ請求・制裁をしない。取引を保留し、証拠と操作ログを保持する。

### 13.5 API障害

- eBay注文を取得できない間は発送しない。
- 支払い状態が確定できない間は精算を成立させない。
- 精算成立後に追跡番号登録だけ失敗した場合、精算を取り消さず再試行する。

---

## 14. 画面要件

### 14.1 顧客画面

#### `/mypage/ebay/cards`

- 出品可能カード
- 条件確認中
- 出品中
- 精算成立
- 出品終了（返却／再出品選択待ち）

#### `/mypage/ebay/cards/[cardId]`

- カード情報、画像、PSA結果
- 出品可能／不可能理由
- 委託販売希望申請
- 当社提示条件・手数料率
- 契約本文と同意
- 出品・精算状況
- 出品期限到達時の「返却」「再出品」選択UI

#### `/mypage/ebay/settlements`

- 精算番号
- カード
- 成約価格・手数料・精算額
- 精算成立日
- 支払予定日
- 支払状態

顧客向け名称は別途決定した表示名を使用する（検討中。§22参照）。

### 14.2 管理画面

管理画面は「鑑定受付」「販売」の2タブに分かれる（[ADR-0079](DECISIONS.md)）。本節の画面はすべて「販売」タブ配下（`/admin/ebay/*`）。既存のPSA鑑定受付側の画面（申込・顧客・PSA提出グループ等）とは完全に分離し、ルート・ナビゲーションを共有しない。データベースも同様に、鑑定受付側モデル（`Application`/`Card`等）と販売側モデル（`ConsignmentAgreement`等、§9参照）を統合せず、`Card.id`を介した参照のみで連結する。

#### `/admin/ebay`

- 要対応件数
- 出品中件数
- 支払済み未精算処理
- 発送待ち
- 精算金未払い
- 出品期限到達・顧客選択待ち
- APIエラー
- 返品・紛争

#### `/admin/ebay/agreements`

- 委託販売希望申請
- 条件確認・承認
- 同意待ち
- 有効契約
- 期限切れ・返却/再出品待ち

#### `/admin/ebay/listings`

- 下書き、API処理中、出品中、売却済み、終了、エラー
- 価格変更、出品停止、同期、eBayページ表示

#### `/admin/ebay/orders`

- 支払い状態
- 精算処理状態
- 発送期限
- 梱包チェック
- 追跡番号
- 返品・返金

#### `/admin/ebay/settlement-payments`

- 支払期限
- 顧客
- 精算額
- 振込状態
- 振込記録
- **委託契約・輸出証憑の月次エクスポート**（[ADR-0085](DECISIONS.md)。7年保存義務があるが、システム側で無期限保持する前提にはせず、月次でCSV/PDF等を出力し横山が自社Googleドライブへ格納する運用。形式・自動化方法は実装時に確定）

#### `/admin/ebay/settings`

- Sandbox／Production
- OAuth接続
- Marketplace
- Business Policy
- Inventory Location
- **手数料率テーブル**（`CommissionRateTier`）
- 同期状態
- 機能フラグ

---

## 15. セキュリティ・監査

- 顧客操作は `getCustomerSession()` で本人確認する。
- 管理操作は `requireAdmin()`／`requireAdminOrStaff()` を適切に使い分ける。
- 外部入力・フォーム・Webhookはzodで検証する。
- Webhook署名またはeBay指定の検証方式を実装する。
- OAuth stateを検証する。
- トークン、銀行情報、配送先、証憑の機密部分を暗号化する。
- 金銭・価格・返金の変更を `OperationLog` に記録する。
- 外部APIのrequest／responseを丸ごと通常ログへ出さない。
- 証憑ダウンロードは認可済み管理者に限定し、短時間の署名URLを使用する。
- 顧客へeBay購入者PIIを開示しない。
- CSRF、レート制限、Bot対策を公開エンドポイントへ追加する。
- **本人確認の要否・方式は未確定**（[ADR-0078](DECISIONS.md)）。委託販売（問屋型）は古物営業法上の買取本人確認義務を基本的に負わない見込みだが、委託・問屋営業自体に別の規制がかかる可能性があるため、行政書士・管轄警察署への確認を実装前に必須で行う。確認結果に応じてオン/オフできるよう、身分証画像アップロード機能自体はPhase 1で土台を作成済み（`/api/s3/presign`のスタッフ対応、[ADR-0077](DECISIONS.md)）。

---

## 16. 通知

顧客通知:

- 出品条件提示
- 契約同意完了
- eBay出品開始
- 支払済み注文成立・精算金額確定
- 精算金支払完了
- 出品期限到達（返却／再出品の選択依頼）
- 出品期限切れ／停止

管理通知:

- eBay OAuth期限・接続異常
- 出品APIエラー
- 支払済み注文の精算処理失敗
- 発送期限接近
- 追跡番号登録失敗
- 返品・紛争
- 精算金支払期限超過

既存 `MailTemplate` を拡張し、本文・件名を管理可能にする。通知失敗は主要取引をロールバックしない。

---

## 17. 非機能要件

### 17.1 整合性

- 1カードにつき有効な委託販売契約は1件。
- 1カードにつき有効なeBay出品は1件。
- 1 `lineItemId` につき精算は1件。
- 売却済みカードを再出品しない。
- 返送中カードを出品しない。

### 17.2 可用性

- eBay障害中もPSA受付機能は利用可能であること。
- 外部同期は非同期化し、画面リクエストを長時間ブロックしない。
- 失敗ジョブを管理画面から安全に再実行できること。

### 17.3 性能

- 顧客・管理一覧はページングする。
- eBay APIレスポンスを必要範囲でキャッシュする。
- カテゴリ・Item Specificsは毎画面取得しない。

### 17.4 保守性

- eBayクライアントを `src/lib/ebay/` に集約する。
- API DTOとDBモデルを直接同一視しない。
- 通貨計算、手数料計算、支払い判定、状態遷移を純関数化しテストする。
- UIコンポーネントからeBay SDK／HTTPを直接呼ばない。

---

## 18. テスト要件

現リポジトリはテスト基盤未導入のため、本機能着手時にVitest等の方針をADRへ記録する。

### 18.1 必須ユニットテスト

- 出品可能判定
- 予約価格判定・不落札時の自動再出品条件（委託契約有効期限内かどうか）
- 手数料率テーブルの価格帯マッチング・手数料額算出
- USD minor unit／JPY変換
- eBay支払い完了判定
- 状態遷移許可・拒否
- 精算成立の冪等性
- 所有者と保管者の独立性
- 返品時の所有権（顧客のまま変わらないこと）の確認

### 18.2 必須統合テスト

- Inventory Item→Offer→Publish
- Publishタイムアウト後の照会・再実行
- 同一Webhookの重複受信
- Webhook欠落後の定期同期
- 支払済み注文→精算→通知
- 精算処理途中のDBエラーで全ロールバック
- 発送登録失敗後の再試行
- Sandboxでの注文・キャンセル・返金同期
- 出品期限到達時の「返却」「再出品」分岐

### 18.3 E2E

- 顧客申請→管理者提示→顧客同意→出品
- 支払済み注文→発送待ち→追跡番号登録
- 精算金支払い→顧客表示
- 期限切れ→顧客選択（返却／再出品）

---

## 19. 実装フェーズ

### Phase 0: 調査・ADR（完了。[ADR-0077](DECISIONS.md)/[ADR-0078](DECISIONS.md)）

- eBay Developer Account／Sandbox確認
- OAuth scope確定
- eBay.comのTrading Cardカテゴリ・必須項目確認
- 即時支払い・Best OfferのAPI仕様確認
- Railwayでのジョブ起動方式決定
- S3公開用画像配信方式決定（→eBay Media API採用で解決済み）
- 委託販売（問屋型）への事業スキーム転換

### Phase 1: PSA運用基盤（実装済み。[ADR-0077](DECISIONS.md)）

- 個体カード展開（`registerCardGrade`による分割）
- PSA結果・画像のスタッフ入力UI
- 所有者・保管者・保管場所（`CardOwnership`/`CardCustody`は未実装、次フェーズ）
- 返送との排他制御
- 操作ログ

### Phase 2: 委託販売契約

- 顧客申請
- 管理確認・条件提示
- 手数料率テーブル管理（`CommissionRateTier`）
- 電子同意
- 出品期限到達時の返却／再出品選択

### Phase 3: eBay出品

- OAuth
- Account／Inventory Location
- 商品データ生成
- Inventory Item／Offer／Publish
- 価格変更・Withdraw
- 同期ジョブ

### Phase 4: 注文・精算

- Webhook／定期同期
- 支払い完了判定
- 精算トランザクション
- 顧客通知

### Phase 5: 発送・輸出・証憑

- 発送作業画面
- Fulfillment API
- 輸出証憑
- 配達・返品・返金
- 監査・レポート

Production機能フラグは全Phaseの受入確認後に有効化する。

---

## 20. 環境変数案

```text
EBAY_ENVIRONMENT=sandbox|production
EBAY_CLIENT_ID=
EBAY_CLIENT_SECRET=
EBAY_REDIRECT_URI=
EBAY_WEBHOOK_VERIFICATION_TOKEN=
EBAY_MARKETPLACE_ID=EBAY_US
EBAY_FEATURE_ENABLED=false
EBAY_PRODUCTION_WRITES_ENABLED=false
```

Business Policy IDやLocation Keyは管理画面／DB管理とし、環境変数に固定しない。

---

## 21. 受入条件

MVP完了条件:

1. PSA鑑定済み個体カードを顧客が委託販売申請できる。
2. ADMINが出品条件・手数料率を提示できる。
3. 顧客が契約内容・手数料率へ電子同意できる。
4. SandboxでeBay出品をAPI公開できる。
5. 出品の価格変更・終了がPSAシステムから行える。
6. 支払済み注文を取得し、重複なく精算を成立させられる。
7. 精算前に発送処理へ進めない。
8. 精算金の支払債務が同一取引に紐付く。
9. 追跡番号をeBayへ登録できる。
10. カード、精算、eBay注文、輸出証憑を管理番号で追跡できる。
11. Webhook重複、APIタイムアウト、再試行で二重出品・二重精算が起きない。
12. 出品期限到達時に顧客が「返却」「再出品」を選択できる。
13. 顧客はeBay購入者PIIを閲覧できない。
14. Production書込は初期状態で無効である。
15. 型チェック、lint、追加した自動テストが通る。

---

## 22. 要事業判断・実装前確認

以下はコードへハードコードせず、実装前に事業責任者へ確認する。

1. ~~顧客向けサービス名称~~ → **判断済み（2026-08-11）**: 「トレカビンクス出品代行サービス」
2. 手数料率テーブルの初期値（価格帯ごとの率）— 仕組みは実装済み（`/admin/ebay/settings`）、実際の%はまだ未入力
3. ~~委託契約の有効期限~~ → **判断済み（2026-08-11、[ADR-0081](DECISIONS.md)）**: 固定値ではなく顧客が複数パターンから選択。`ListingDurationOption`として管理画面で追加・編集・削除・非表示可（初期提案: 30日／60日／90日）。実装済み、初期データは未投入
4. ~~eBay出品期間~~ → **判断済み（2026-08-11、[ADR-0081](DECISIONS.md)、[ADR-0083](DECISIONS.md)により一部更新）**: 委託契約の有効期限（`ListingDurationOption`）とは別に、eBayは**オークション形式**（1回1/3/5/7/10日サイクル、初期提案7日）で運用し、不落札なら委託契約の有効期限内で自動再出品する。GTC自動更新は使わない（ADR-0081決定4はSuperseded）
5. ~~精算成立から振込までの営業日数~~ → **判断済み→改訂（2026-08-11、[ADR-0082](DECISIONS.md)は[ADR-0085](DECISIONS.md)によりSuperseded）**: 「精算成立から5営業日以内」ではなく、**配達完了（`deliveredAt`）から35日後**に変更。返品クローバックリスク（eBay入金後に返品が起き、既に顧客へ振込済みだと回収が必要になる）を踏まえ、eBay標準返品期間30日を安全に超える起算方式にした
6. ~~振込手数料の負担者~~ → **判断済み（2026-08-11）**: 顧客負担（精算額から差し引く）
7. ~~支払後・発送前キャンセル時の扱い~~ → **判断済み（2026-08-11、[ADR-0082](DECISIONS.md)）**: 自由な取消は不可。既存の`CANCEL_PENDING`＋ADMIN判断運用（§13.2）を維持
8. ~~顧客が出品を途中解除できる条件と手数料~~ → **判断済み（2026-08-11、[ADR-0082](DECISIONS.md)）**: 出品後の自由な取下げは不可（契約期間中は拘束）。7と同じ結論
9. ~~Best Offerの自動承認／自動拒否範囲~~ → **廃止（2026-08-11、[ADR-0083](DECISIONS.md)）**: 出品形式をオークション専業にしたためBest Offer自体が存在しない（ADR-0082決定3はSuperseded）。代わりに予約価格（`reservePriceUsdMinor`）で下限を担保する
10. ~~為替レートの取得元と精算への反映方法~~ → **判断済み（2026-08-11、[ADR-0084](DECISIONS.md)）**: 既存の`lib/exchange-rate.ts`（Frankfurter API日次自動取得の仕組み）をそのまま流用。新規実装なし
11. ~~eBay送料を商品価格へ含めるか別請求にするか~~ → **判断済み（2026-08-11、[ADR-0082](DECISIONS.md)）**: 別請求（eBayのFulfillment Policy側で設定）
12. ~~出品対象グレード・最低見込価格~~ → **判断済み（2026-08-11、[ADR-0085](DECISIONS.md)）**: 最低見込価格は当社側で自動算出しない。顧客自身が調べて`customerDesiredPriceUsdMinor`（希望開始価格）として入力する既存設計をそのまま使う。対象グレードの下限（足切り）も新設しない
13. ~~輸出配送業者と保険・署名基準~~ → 保険料率は**判断済み（2026-08-11、[ADR-0084](DECISIONS.md)/[ADR-0085](DECISIONS.md)）: 申告価格の2%で確定**（グレサ/Fanatics Collect水準）。配送業者・署名基準は引き続き未確定
14. ~~委託契約・輸出証憑の保存年限~~ → **判断済み（2026-08-11、[ADR-0084](DECISIONS.md)）**: 7年（関税法の輸出書類保存5年・法人税法の帳簿書類保存7年の両方を満たす長い方）
15. **委託・問屋営業に伴う法令上の要件確認方法**（本人確認の要否・古物営業法上の古物競りあっせん業該当性、行政書士・管轄警察署への確認窓口）— 問い合わせ文面作成済み、回答待ち
16. ~~発送後返品時のリスク分担~~ → **一部判断済み（2026-08-11、[ADR-0085](DECISIONS.md)）**: 精算済み後に返品が発生した場合、グレサと同様に**差額を顧客へ請求する**方針に確定。返送送料・為替差損・eBay手数料の詳細な負担配分は引き続き未確定
17. ~~出品期限到達時の「再出品」時、価格改定を必須にするか任意にするか~~ → **判断済み（2026-08-11、[ADR-0084](DECISIONS.md)）**: 任意
18. 消費税・インボイス処理（問屋型の場合の売上計上主体・消費税区分）の既存運用との接続方法 — 問い合わせ文面作成済み、回答待ち
19. ~~Fanatics Collect/Goldin対応の要否・優先度~~ → **判断済み（2026-08-11）**: 販売チャネルは一旦eBayのみで進める。Fanatics Collect/Goldinは保留（`SalesPlatform` enumの選択肢としては残すが連携実装は着手しない）
20. ~~1回あたりのオークションサイクル日数~~ → **判断済み（2026-08-11、[ADR-0083](DECISIONS.md)）**: 7日（週次）で確定
21. ~~予約価格未達で委託契約の有効期限に到達した場合の扱い~~ → **判断済み（2026-08-11、[ADR-0083](DECISIONS.md)）**: 通常の「売れ残り」と同じフロー（§5.5）で統一的に扱う（不落札の理由による分岐はしない）

---

## 23. 実装完了時のドキュメント更新

Claude Codeは各Phase完了時に以下を更新すること。

- `docs/DECISIONS.md`: 採用した重要設計をADR化
- `docs/ARCHITECTURE.md`: eBay境界、ジョブ、所有権管理を追記
- `docs/DATABASE.md`: 新規モデルと制約を追記
- `docs/API.md`: Webhook／OAuth callback／内部routeを追記
- `docs/SECURITY.md`: OAuthトークン、PII、Webhook、証憑を追記
- `docs/TASKS.md`: Phase単位で進捗更新
- 本書: 実装との差異・確定した事業判断を反映

---

## 24. Claude Codeへの依頼文テンプレート

```text
docs/EBAY_CONSIGNMENT_SALES_SPEC.md を正として、eBay委託販売（問屋型）・輸出機能を実装してください。

最初に AGENTS.md と関連docs（ADR-0077/0078含む）をすべて確認し、既存実装との衝突、DB変更案、実装順序を提示してください。要事業判断を勝手に決めないでください。

一度に全Phaseを実装せず、Phaseごとに以下を行ってください。
1. 影響範囲の確認
2. 非破壊的な最小実装
3. 自動テスト
4. 型チェック・lint・build
5. 関連ドキュメント更新
6. 変更点・テスト結果・残課題の報告

既存のPSA料金計算、カード進捗、認証、Stripeフローを変更しないでください。既存の未コミット変更を巻き戻さないでください。本番eBayへの書込は行わず、Sandboxを使用してください。当社が所有権を取得する「買取」の実装は行わないでください（委託販売のみ）。
```
