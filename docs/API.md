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
| `/api/s3/presign` | POST | 顧客セッション | in: `{ cardId|tempId, type:"front"|"back"|"damage", contentType }` / out: `{ uploadUrl, key }` |
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

#### `getMyApplications()` / `getApplicationDetail(id)`
- 認証: 顧客セッション（詳細は自分の申込のみ）
- out: Application（+Cards/Payments、詳細はStatusHistory/Agreement）

#### `upsertSubmissionBooking(input)` / `cancelSubmissionBooking(id)`（submission-booking.ts）
- 認証: 顧客セッション。支払済み申込のみ予約可。
- in: `{ applicationId, method:"STORE_DROP_OFF"|"SHIPPING", scheduledAt, note? }`
- 処理: 申込ごとに1件のカード提出予約を作成/更新。キャンセル時は `status=CANCELLED`。

#### `deletePaymentMethod(methodId)`（payment.ts）
- 認証: 顧客セッション（本人のカードのみ）。Stripe detach → DB削除

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
