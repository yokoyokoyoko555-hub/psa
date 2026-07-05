# ARCHITECTURE — PSA鑑定受付代行システム

> 本書はシステムの全体構成を記述する「正」のドキュメント。
> 実装と乖離が出た場合は、実装を確認のうえ本書を更新すること（AGENTS.md のルール参照）。
> 最終更新: 2026-06-20

---

## 1. システム概要

株式会社ツルプルンが運営する **トレカビンクス** 向けの「PSA鑑定受付代行」Webシステム。

- 顧客はトレーディングカード（PSA日本/US）に加え、PSA US向けに未開封パック・コミック/マガジンのPSA鑑定もオンラインで申し込み、Stripeで決済する（アイテム種別`ItemType`。[ADR-0023](DECISIONS.md)）。PSA日本はトレーディングカードのみ
- 1枚ごとに自社管理番号（CARD-…）とQRコードを発行し、17段階のステータスで進捗を管理
- 店舗スタッフがカードを検品 → PSA提出グループにまとめて提出 → グレード結果を登録 → 顧客へ返却
- PSA鑑定で申告価格を超過した場合の追加請求（Upcharge）に対応（保存済みカードへ自動オフセッション課金）

利益モデル: PSA公表価格の **80%** が仕入コスト（ディーラーレート）。`ServicePrice.pricePerCard` が顧客請求額。
利益 = `pricePerCard - (PSA公表価格 × 0.8) + agencyFee`。

本番URL: https://psa-production-a106.up.railway.app

---

## 2. 使用技術

| カテゴリ | 技術 | バージョン/補足 |
|---------|------|----------------|
| フレームワーク | Next.js (App Router) | 15.3.8 |
| 言語 | TypeScript | strict mode |
| スタイリング | Tailwind CSS | v4（`@tailwindcss/postcss`） |
| DB | PostgreSQL | Railway Postgres アドオン |
| ORM | Prisma | 7.8.0 + `@prisma/adapter-pg`（driver adapter） |
| 管理者認証 | NextAuth | v5 (beta) Credentials + JWT |
| 顧客認証 | 自前cookieセッション | `CustomerSession` テーブル |
| 決済 | Stripe | SDK v17（APIバージョン `2025-02-24.acacia`） |
| ストレージ | AWS S3 | presigned URL 直アップロード |
| メール | nodemailer | SMTP |
| バリデーション | zod | 全Server Action入力 |
| フォーム | react-hook-form | 顧客フォーム |
| 2FA(未完) | speakeasy | TOTP（足場のみ、未配線） |
| パスワード | bcryptjs | rounds=12 |
| QR | qrcode | カード識別QR生成 |
| デプロイ | Railway | Nixpacks（`nixpacks.toml` / `.node-version`） |

---

## 3. ディレクトリ構成

リポジトリルート = `psa-system/`（GitHub: yokoyokoyoko555-hub/psa, master 自動デプロイ）

```
psa-system/
├── prisma/
│   ├── schema.prisma        # 全モデル定義（DBの単一の真実）
│   └── seed.ts              # 初期データ（管理者/スタッフ/料金/テスト顧客）
├── src/
│   ├── app/                 # App Router
│   │   ├── page.tsx                 # / トップ(LP)
│   │   ├── register/ login/         # 顧客 会員登録・ログイン
│   │   ├── apply/                   # PSA申込フォーム(多ステップ) + ApplyForm.tsx
│   │   ├── mypage/                  # 顧客マイページ（layout=force-dynamic）
│   │   │   ├── applications/[id]/   # 申込詳細・カード進捗
│   │   │   ├── submission-booking/  # カード提出予約カレンダー
│   │   │   └── settings/            # 登録情報・返送先・保存カード管理
│   │   ├── admin/                   # 管理画面（layout=force-dynamic + 認証）
│   │   │   ├── login/ dashboard/
│   │   │   ├── customers/[id]/ applications/[id]/
│   │   │   ├── submission-bookings/ # 提出予約カレンダー
│   │   │   ├── cards/[id]/          # ステータス更新/グレード登録/Upcharge
│   │   │   ├── psa-groups/          # PSA提出グループ
│   │   │   └── settings/            # 料金/送料/保険料設定（ADMINのみ）
│   │   └── api/                     # APIルート（§5）
│   ├── actions/             # Server Actions（mutationの主役）
│   │   ├── customer.ts      # 登録/ログイン/ログアウト/プロフィール
│   │   ├── application.ts   # 申込作成/一覧/詳細
│   │   ├── admin.ts         # カード/PSAグループ/グレード/Upcharge/集計
│   │   ├── submission-booking.ts # カード提出予約
│   │   └── payment.ts       # 保存カード削除
│   ├── lib/                 # 横断ロジック
│   │   ├── prisma.ts        # PrismaClient（PrismaPgアダプタ、シングルトン）
│   │   ├── auth.ts          # NextAuth（管理者）
│   │   ├── customer-auth.ts # 顧客cookieセッション
│   │   ├── crypto.ts        # AES-256-GCM PII暗号化（遅延キー取得）
│   │   ├── stripe.ts        # Stripeクライアント（遅延初期化 getStripe）
│   │   ├── s3.ts            # S3クライアント（遅延初期化 getS3）
│   │   ├── mailer.ts        # nodemailer + メールテンプレート
│   │   ├── fee-calculator.ts# 料金計算（税/送料/保険）
│   │   ├── number-generator.ts # APP-/CARD-/PSG- 採番
│   │   └── operation-log.ts # 操作ログ記録 + IP取得
│   ├── types/next-auth.d.ts # セッション型拡張（role等）
│   └── middleware.ts        # セキュリティヘッダのみ（Edge、認証は呼ばない）
├── docs/                    # 本ドキュメント群
├── nixpacks.toml            # ビルド/起動定義（install=--include=dev, start=db push）
├── railway.json            # Railway設定（※startCommandは旧migrate deployが残存・§DECISIONS参照）
├── prisma.config.js         # Prisma7設定（datasource.url, schema path）
├── .node-version            # 22.15.0（Prisma7のNode要件）
└── next.config.ts           # serverActions bodyLimit 10mb, images
```

---

## 4. DB構成

`prisma/schema.prisma` が単一の真実。マイグレーションファイルは持たず **`prisma db push`** でスキーマ同期（§DECISIONS）。

### モデル一覧（16）

| モデル | 役割 | 主なポイント |
|--------|------|-------------|
| `User` | 管理者/スタッフ | `role`(ADMIN/STAFF/…), `passwordHash`, 2FA項目 |
| `Customer` | 顧客 | PII列は `*Encrypted`（AES-256-GCM）, `email`/`postalCode`は平文, `stripeCustomerId` |
| `CustomerAddress` | 返送先情報 | 姓名/ローマ字/住所を暗号化保存 |
| `CustomerSession` | 顧客セッション | `sessionToken`(cookie), `expires` |
| `Application` | 申込 | `applicationNo`(APP-…), `itemType`(TRADING_CARD/UNOPENED_PACK/COMIC_MAGAZINE。JPは常にTRADING_CARD), 返送先住所/電話（暗号化）, 料金内訳(`autographFeeTotal`含む), `status` |
| `Card` | カード（最重要） | `cardNo`(CARD-…), PSA各種ID/grade, 画像S3キー, `status`(17段階), 料金, `language`(自由記述), `autographRequested`/`autographFee`(オートグラフ) |
| `CardStatusHistory` | ステータス履歴 | `changedBy`(userId or customerId) |
| `PsaSubmissionGroup` | PSA提出グループ | `groupNo`(PSG-…), `psaSubmissionId`/`psaOrderId` |
| `Payment` | 決済 | `stripePaymentIntentId`, `status` |
| `Upcharge` | 追加請求 | `psaDeclaredValue`/`psaFinalValue`/`upchargeAmount`, `status` |
| `ServicePrice` | サービス料金（トレーディングカードのみ） | `[serviceLevel, region, itemType]`(unique), `pricePerCard`, `agencyFee` |
| `CustomServicePrice` | 動的サービスタイア（未開封パック/コミック・マガジン/オートグラフ） | `category`(UNOPENED_PACK/COMIC_MAGAZINE/AUTOGRAPH), `name`(自由入力), `pricePerCard`/`cost`/`maxDeclaredValue`。管理画面でCRUD可能。[ADR-0025](DECISIONS.md) |
| `ShippingRule` | 送料 | 金額帯（`minAmount`/`maxAmount`）ごと |
| `InsuranceRule` | 保険料 | 申告額帯ごと（`fee` または `feeRate`） |
| `Agreement` | 電子同意書 | 申込時スナップショット, IP/UA |
| `Notification` | お知らせ/通知 | 顧客別 or 全体、公開/非公開とマイページ表示対象を選択可 |
| `OperationLog` | 操作ログ | `before`/`after`(Json), index(userId/customerId/createdAt) |
| `SavedPaymentMethod` | 保存カード | `stripePaymentMethodId`, `brand`/`last4`, `isDefault` |

### 主なEnum
`UserRole`(ADMIN/STAFF/ACCOUNTING/CUSTOMER), `CardStatus`(17値), `ApplicationStatus`, `ServiceLevel`(VALUE/REGULAR/EXPRESS/SUPER_EXPRESS), `ReturnMethod`(STORE_PICKUP/SHIPPING), `CardLanguage`, `PaymentStatus`, `UpchargeStatus`, `NotificationType`, `SubmissionBookingMethod`, `SubmissionBookingStatus`。

> 補足: モデル詳細・リレーション・ER図は [docs/DATABASE.md](DATABASE.md) を参照。

### カードステータスフロー（17段階）
```
DRAFT → SUBMITTED_BY_CUSTOMER → RECEIVED_BY_STORE → INSPECTION_PENDING → INSPECTED
→ READY_FOR_PSA → SUBMITTED_TO_PSA → PSA_RECEIVED → GRADING → GRADE_AVAILABLE
→ RETURNED_TO_STORE → READY_FOR_CUSTOMER_RETURN → RETURNED_TO_CUSTOMER
Upcharge分岐: UPCHARGE_UNPAID → UPCHARGE_PAID
異常系: PROBLEM / CANCELLED
```

---

## 5. API構成

ミューテーションの大半は **Server Actions**（`src/actions/`）で実装。RESTルートは外部連携・特殊用途のみ。

### APIルート（`src/app/api/`）

| ルート | メソッド | 認証 | 役割 |
|--------|---------|------|------|
| `/api/auth/[...nextauth]` | GET/POST | — | NextAuth ハンドラ（管理者ログイン） |
| `/api/health` | GET | なし | `SELECT 1` でDB死活確認（Railway healthcheck） |
| `/api/s3/presign` | POST | 顧客セッション | S3アップロード用presigned URL発行（front/back/damage） |
| `/api/qrcode` | GET | NextAuth | カード識別QRコード生成 |
| `/api/stripe/webhook` | POST | Stripe署名 | 決済イベント処理（succeeded/failed/method.attached） |
| `/api/admin/service-prices` | PUT | NextAuth(ADMIN) | 料金設定更新 |

すべてのAPIルートは `export const dynamic = "force-dynamic"` 指定（ビルド時静的化を回避）。

### 主なServer Actions

| ファイル | 関数 | 認可 |
|---------|------|------|
| customer.ts | registerCustomer / loginCustomer / logoutCustomer / getCustomerProfile | 顧客 |
| application.ts | createApplication / getMyApplications / getApplicationDetail | 顧客 |
| admin.ts | getDashboardStats / updateCardStatus / createPsaSubmissionGroup / submitPsaGroup / recordGrade / createUpcharge / getAdminCards / getAdminCustomers | ADMIN or STAFF |
| submission-booking.ts | upsertSubmissionBooking / cancelSubmissionBooking / cancelSubmissionBookingByAdmin | 顧客 / ADMIN or STAFF |
| payment.ts | deletePaymentMethod | 顧客 |

---

## 6. 認証方式

**二系統の認証**（管理側と顧客側で別実装）。

### 管理者/スタッフ — NextAuth v5 (JWT)
- `src/lib/auth.ts`。Credentials provider `admin-credentials`（email+password）
- `User.passwordHash` を bcrypt 照合 → JWTに `role`/`twoFactorEnabled` を格納
- セッション戦略 `jwt`、`trustHost: true`
- 認可ヘルパ: `requireAdmin`（ログイン必須）/ `requireAdminOrStaff`（role∈{ADMIN,STAFF}）
- 認可は **各ページ/レイアウト/Action側で実施**（middlewareでは行わない＝Edge制約のため）
- 2FA: `speakeasy` 依存と `twoFactorEnabled` 列、ログイン画面の2FAステップUIは存在するが **TOTP検証は未配線（未完）**

### 顧客 — 自前cookieセッション
- `src/lib/customer-auth.ts`。`randomBytes(32)` トークンを `CustomerSession` に保存、cookie `customer_session`（httpOnly/secure/lax, 30日）
- `getCustomerSession()` でトークン検証 → `Customer` を返す（期限切れは破棄）

---

## 7. 決済方式（Stripe）

- **顧客登録時**: Stripe Customer を作成し `Customer.stripeCustomerId` に保存（`createCustomer`）
- **申込時**: `createPaymentIntent`（`setup_future_usage: off_session`, `automatic_payment_methods`）→ `Payment` を PENDING で作成
- **Webhook** (`/api/stripe/webhook`):
  - `payment_intent.succeeded` → Payment=SUCCEEDED, Application=SUBMITTED, Card一括=SUBMITTED_BY_CUSTOMER, PaymentMethodを `SavedPaymentMethod` に保存
  - `payment_intent.payment_failed` → Payment=FAILED（Upchargeも考慮）
  - `payment_method.attached` → SavedPaymentMethod 追加
- **Upcharge**: `chargeOffSession`（保存済みデフォルトカードに `off_session: true, confirm: true` で自動課金）→ 成功で Card=UPCHARGE_PAID
- カード番号・CVCは **一切保存しない**（Stripe側のみ）

> ⚠️ **未完**: 申込フォーム(`ApplyForm.tsx`)の支払いステップは **Stripe Elements がプレースホルダ**。`confirmCardPayment` はスタブで、実カード入力UI（`@stripe/react-stripe-js`）が未統合。決済フローはエンドツーエンドで未完成（§TASKS）。

---

## 8. セキュリティ設計

- PII（氏名/カナ/電話/都道府県/住所）は **AES-256-GCM** 暗号化（`crypto.ts`、キーは `ENCRYPTION_KEY` env）
- パスワードは bcrypt rounds=12
- 操作ログ（`OperationLog`）に管理操作・顧客操作を記録
- S3は presigned URL で直アップロード（サーバ経由しない）
- セキュリティヘッダ（X-Frame-Options 等）を `middleware.ts` で付与
- 環境変数依存モジュール（Stripe/S3/crypto）は **遅延初期化**（ビルド時に env 無しでも落ちない）
