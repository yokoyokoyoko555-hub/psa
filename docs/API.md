# API — エンドポイント / Server Actions 仕様

> ミューテーションの大半は **Server Actions**（`src/actions/`）。RESTルートは外部連携・特殊用途のみ。
> 最終更新: 2026-06-18

---

## REST API Routes（`src/app/api/`）

すべて `export const dynamic = "force-dynamic"`。

| ルート | メソッド | 認証 | 入出力 |
|--------|---------|------|--------|
| `/api/auth/[...nextauth]` | GET/POST | — | NextAuth v5 ハンドラ（管理者ログイン） |
| `/api/health` | GET | なし | `SELECT 1` 成功で `{status:"ok"}`、失敗で 503 |
| `/api/s3/presign` | POST | 顧客セッション or 管理者/スタッフ(NextAuth) | in: `{ cardId|tempId, type:"front"|"back"|"damage", contentType }` / out: `{ uploadUrl, key }`。スタッフ利用時は`staff-temp/{userId}/{tempId}/...`にキー発行（PSAグレード登録用。[ADR-0077](DECISIONS.md)） |
| `/api/qrcode` | GET | NextAuth | `?cardId=…` → カード識別QR（PNG） |
| `/api/stripe/webhook` | POST | Stripe署名 | 決済イベント処理（下記） |
| `/api/admin/service-prices` | PUT | NextAuth(ADMIN) | in: `[{ id, pricePerCard, agencyFee }]` |

### Stripe Webhook 処理イベント
- `payment_intent.succeeded` → Payment=SUCCEEDED, Application=SUBMITTED, 対象Card一括=SUBMITTED_BY_CUSTOMER, PaymentMethodを `SavedPaymentMethod` に保存
- `payment_intent.payment_failed` → Payment=FAILED（Upcharge分も考慮）
- `payment_method.attached` → SavedPaymentMethod 追加

---

## Server Actions

### 顧客向け（`src/actions/customer.ts`, `application.ts`, `payment.ts`）

#### `registerCustomer(input)` — 会員登録
- in: 氏名/フリガナ/メール/電話/郵便番号/都道府県/住所/(建物)/パスワード（zod検証）
- 処理: PII暗号化 → bcrypt(12) → Stripe Customer作成 → Customer作成 → 操作ログ → cookieセッション発行
- out: `{ success, error? }`

#### `loginCustomer(input)` / `logoutCustomer()`
- login: メール+パスワード、bcrypt照合 → セッション発行 → 操作ログ。out: `{ success, error? }`
- logout: セッション破棄 → `/login` へ redirect

#### `getCustomerProfile()`
- 認証: 顧客セッション。out: 復号済みプロフィール or null

#### `createApplication(input)` — PSA申込作成
- in: カード配列 / serviceLevel / returnMethod / 同意書(text,version,ip,ua)（zod）
- 処理（トランザクション）:
  1. `calculateFees`（PSA料金+代行手数料+送料+保険+税10%）
  2. Application / Card[] / Agreement 作成
  3. Stripe PaymentIntent 作成（`setup_future_usage: off_session`）
  4. Payment(PENDING) 作成 / 操作ログ
- out: `{ success, clientSecret?, applicationId?, error? }`
- ⚠️ 前段に `customer.stripeCustomerId` 必須。フロントの決済確定UIは未完（[TASKS.md]）

#### `createStoreRequest(input)` — 代理申込依頼
- in: `region` / `returnMethod` / 返送先住所 / 電話番号 / `savedPaymentMethodId` / 同意情報
- 処理: `source=STORE, status=DRAFT` の申込を作成。返送先住所・電話番号を暗号化保存し、選択された保存カードIDを保持する。

#### `getMyApplications()` / `getApplicationDetail(id)`
- 認証: 顧客セッション（詳細は自分の申込のみ）
- out: Application（+Cards/Payments、詳細はStatusHistory/Agreement）

#### `upsertSubmissionBooking(input)` / `cancelSubmissionBooking(id)`（submission-booking.ts）
- 認証: 顧客セッション。支払済み申込のみ予約可。
- in: `{ applicationId, method:"STORE_DROP_OFF"|"SHIPPING", scheduledAt, note? }`
- 処理: 申込ごとに1件のカード提出予約を作成/更新。予約不可日は作成不可。キャンセル時は `status=CANCELLED`。

#### `deletePaymentMethod(methodId)`（payment.ts）
- 認証: 顧客セッション（本人のカードのみ）。Stripe detach → DB削除

#### 本人確認（`identity-verification.ts`）。仕様書§5.2/§15、[ADR-0087](DECISIONS.md)
- `getMyIdentityVerificationStatus()`: 本人確認の現在状態（`identityVerifiedAt`と最新申請）を返す
- `submitIdentityVerification({documentType, frontImageKey, backImageKey?})`: 本人確認申請。審査中の申請が既にある場合はエラー

#### eBay買取（`purchase.ts`）。仕様書§5.3、[ADR-0087](DECISIONS.md)
- `getPurchaseEligibility(cardId)`: 買取可能条件（仕様書§6）の判定結果を返す。本人確認未了の場合は理由に含める
- `requestPurchase({cardId, customerDesiredPriceUsdMinor, listingDurationOptionId})`: 買取申請（`status=UNDER_REVIEW`で作成）。本人確認未完了だとエラー
- `agreePurchaseAgreement(agreementId)`: 電子同意。`status=ACTIVE`へ遷移し`CardOwnership.status`を`PURCHASE_RESERVED`に変更

### 管理者向け（`src/actions/admin.ts`）

認可ヘルパ: `requireAdmin`(ログイン必須) / `requireAdminOrStaff`(role∈{ADMIN,STAFF})。

| 関数 | 権限 | 概要 |
|------|------|------|
| `getDashboardStats()` | ADMIN/STAFF | `{ total, psaWaiting, psaReturning, unpaid, upchargeCount }` |
| `updateCardStatus(cardId,status,note?)` | ADMIN/STAFF | Card更新 + 履歴 + 操作ログ |
| `createPsaSubmissionGroup(cardIds)` | ADMIN/STAFF | グループ作成、対象Card=READY_FOR_PSA |
| `submitPsaGroup(groupId,params)` | ADMIN/STAFF | submission/order Id設定、Card=SUBMITTED_TO_PSA |
| `recordGrade(cardId,params)` | ADMIN/STAFF | certNo/grade設定、Card=GRADE_AVAILABLE |
| `createUpcharge(input)` | ADMIN/STAFF | Upcharge作成→メール通知→保存カードへ自動課金→PAID/FAILED |
| `getAdminCards(params)` | ADMIN/STAFF | 検索/絞り込み/ページング |
| `getAdminCustomers(params)` | ADMIN/STAFF | 顧客一覧 |
| `cancelSubmissionBookingByAdmin(id)` | ADMIN/STAFF | 提出予約をキャンセル |
| `upsertSubmissionCalendarDay(input)` | ADMIN/STAFF | 予約受付不可日・発送日を設定 |
| `registerCardGrade(cardId, units[])`（card-grading.ts） | ADMIN/STAFF | PSAグレード登録＋個体分割。実返却数分の個体Card（quantity=1・psaCertNo/psaGrade/画像キー）を生成し、元行に`gradingSplitCompletedAt`を設定。[ADR-0077](DECISIONS.md) |
| `getCommissionRateTiers(platform?)`（ebay-settings.ts） | 閲覧はADMIN/STAFF | 手数料率テーブル一覧取得 |
| `saveCommissionRateTiers({platform,tiers[]})`（ebay-settings.ts） | ADMINのみ | 指定プラットフォームの手数料率テーブルを全置換保存（`ShippingInsuranceRate`と同じdelete-all-recreate方式）。[ADR-0078](DECISIONS.md)/[ADR-0080](DECISIONS.md) |
| `getListingDurationOptions(platform?)`（ebay-settings.ts） | 閲覧はADMIN/STAFF | 買取契約の有効期限パターン一覧取得 |
| `saveListingDurationOption(input)`/`deleteListingDurationOption(id)`（ebay-settings.ts） | ADMINのみ | 有効期限パターンの追加・編集・削除。[ADR-0081](DECISIONS.md) |
| `getPendingIdentityVerifications()`（identity-verification.ts） | ADMIN/STAFF | 審査待ちの本人確認一覧取得 |
| `reviewIdentityVerification({verificationId,approve,rejectionReason?})`（identity-verification.ts） | ADMIN/STAFF | 本人確認を承認/却下。承認時に`Customer.identityVerifiedAt`を更新。[ADR-0087](DECISIONS.md) |
| `getAllPurchaseAgreements()`（purchase.ts） | ADMIN/STAFF | 買取契約の一覧取得 |
| `reviewPurchaseAgreement({agreementId,startingPriceUsdMinor,reservePriceUsdMinor})`（purchase.ts） | ADMIN/STAFF | 開始価格・予約価格を確定し`status=AWAITING_CUSTOMER_AGREEMENT`へ。[ADR-0087](DECISIONS.md) |

料金設定の更新は `PUT /api/admin/service-prices`（**ADMINのみ**）。

---

## 入力検証・エラー方針
- 外部入力は **zod 必須**。`safeParse` 失敗時はユーザー向け日本語エラーを `{ success:false, error }` で返す。
- 認可失敗は `throw new Error("Unauthorized"|"Forbidden")`。
- 金額は **円・整数**。

---

## 将来: PSA API連携（設計メモ）
現状は管理画面からの手動運用。将来のPSA公式API連携に備え、アダプタ差し替えで対応する想定。
```ts
interface PsaApiAdapter {
  createSubmission(cards: Card[]): Promise<{ submissionId: string; orderId: string }>;
  getSubmissionStatus(submissionId: string): Promise<SubmissionStatus>;
  getGrades(submissionId: string): Promise<GradeResult[]>;
}
// 現在: 手動入力 / 将来: api.psacard.com 連携
```
（実装する場合は [DECISIONS.md] にADRを追加すること）
