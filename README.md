# PSA鑑定受付代行システム - トレカビンクス

株式会社ツルプルンが運営するトレカビンクス向けPSA鑑定受付代行Webシステム。

**本番**: https://psa-production-a106.up.railway.app （Railway, master push で自動デプロイ）

## ドキュメント

| 文書 | 内容 |
|------|------|
| [AGENTS.md](AGENTS.md) | **AI開発者（Claude Code / Codex）向けガイド・規約。作業前に必読** |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | システム構成・技術・DB・API・認証・決済 |
| [docs/TASKS.md](docs/TASKS.md) | 実装済み/未実装機能の一覧 |
| [docs/DECISIONS.md](docs/DECISIONS.md) | 設計判断記録（ADR） |
| [docs/ER_DIAGRAM.md](docs/ER_DIAGRAM.md) | ER図 |
| [docs/API_DESIGN.md](docs/API_DESIGN.md) | API設計 |
| [docs/PROJECT_BRIEF.md](docs/PROJECT_BRIEF.md) | Codex等へ渡す一枚要約 |

## 技術スタック

| カテゴリ | 技術 |
|---------|------|
| フレームワーク | Next.js 15 (App Router) |
| 言語 | TypeScript (strict mode) |
| スタイリング | Tailwind CSS v4 |
| DB | PostgreSQL |
| ORM | Prisma v7 |
| 認証（管理者） | NextAuth v5 (beta) |
| 認証（顧客） | カスタムセッション (cookie) |
| 決済 | Stripe |
| ストレージ | AWS S3 |
| デプロイ | Railway (Nixpacks) |

## ローカルセットアップ

> **注意**: Google Drive上（G:ドライブ等）ではnpm installが正常に動作しません。  
> ローカルドライブ（C:等）にプロジェクトをコピーしてから以下を実行してください。

```bash
# 1. 依存関係インストール
npm install --legacy-peer-deps

# 2. 環境変数設定
cp .env.example .env
# .envを編集（DATABASE_URL, STRIPE_SECRET_KEY, AWS_*等）

# 3. DBスキーマ同期（db pushで運用。migrateは未使用）
npm run db:push

# 4. シードデータ投入
npm run db:seed

# 5. 開発サーバー起動
npm run dev
```

> Prisma v7 のため、スキーマ反映は `prisma migrate` ではなく **`prisma db push`** を使用（[ADR-0004](docs/DECISIONS.md)）。

## 必要な環境変数

| 変数名 | 説明 |
|--------|------|
| DATABASE_URL | PostgreSQL接続URL |
| NEXTAUTH_SECRET | NextAuth署名シークレット（32文字以上） |
| NEXTAUTH_URL | サイトURL（例: http://localhost:3000） |
| ENCRYPTION_KEY | PII暗号化キー（64文字hex = 32bytes） |
| STRIPE_SECRET_KEY | Stripe シークレットキー (sk_*) |
| STRIPE_PUBLISHABLE_KEY | Stripe 公開キー (pk_*) |
| STRIPE_WEBHOOK_SECRET | Stripe Webhook署名シークレット (whsec_*) |
| AWS_ACCESS_KEY_ID | AWS アクセスキーID |
| AWS_SECRET_ACCESS_KEY | AWS シークレットアクセスキー |
| AWS_REGION | S3リージョン（例: ap-northeast-1） |
| AWS_S3_BUCKET | S3バケット名 |
| EMAIL_FROM | 送信元メールアドレス |
| SMTP_HOST | SMTPサーバーホスト |
| SMTP_PORT | SMTPポート（例: 587） |
| SMTP_USER | SMTPユーザー名 |
| SMTP_PASS | SMTPパスワード |

## テストアカウント（シードデータ）

> ⚠️ 本番公開前に必ずパスワードを変更すること。

| 種別 | メール | パスワード | 権限 |
|------|--------|----------|------|
| 管理者(ADMIN) | admin@turupurun.com | Admin1234! | 全機能 |
| スタッフ(STAFF) | staff@turupurun.com | Staff1234! | 料金設定以外 |
| テスト顧客 | test@example.com | Test1234! | 顧客 |

管理ロールは **ADMIN / STAFF の2種**（[ADR-0008](docs/DECISIONS.md)）。

## ページ構成

### 顧客向け
- `/` — トップページ（LP）
- `/register` — 新規会員登録
- `/login` — ログイン
- `/apply` — PSA申込フォーム（多ステップ）
- `/mypage` — マイページ
- `/mypage/applications` — 申込一覧
- `/mypage/applications/[id]` — 申込詳細・カード状況
- `/mypage/payment-methods` — 支払い方法管理

### 管理者向け
- `/admin/login` — 管理ログイン
- `/admin/dashboard` — ダッシュボード
- `/admin/customers` — 顧客一覧
- `/admin/customers/[id]` — 顧客詳細
- `/admin/applications` — 申込一覧
- `/admin/applications/[id]` — 申込詳細
- `/admin/cards` — カード一覧
- `/admin/cards/[id]` — カード詳細（ステータス更新/グレード登録/Upcharge）
- `/admin/psa-groups` — PSAグループ管理
- `/admin/settings` — 料金設定

## カードステータスフロー（17段階）

```
DRAFT
  → SUBMITTED_BY_CUSTOMER（顧客申込）
  → RECEIVED_BY_STORE（店舗受取）
  → INSPECTION_PENDING（検品待ち）
  → INSPECTED（検品済み）
  → READY_FOR_PSA（PSA提出準備）
  → SUBMITTED_TO_PSA（PSA提出）
  → PSA_RECEIVED（PSA受付）
  → GRADING（鑑定中）
  → GRADE_AVAILABLE（グレード確定）
  → RETURNED_TO_STORE（店舗返却）
  → READY_FOR_CUSTOMER_RETURN（返却準備）
  → RETURNED_TO_CUSTOMER（返却完了）

Upcharge発生ルート:
  → UPCHARGE_UNPAID → UPCHARGE_PAID → （返却フローへ）

異常系: PROBLEM / CANCELLED（任意タイミングで遷移可）
```

## Railway デプロイ手順

1. Railwayプロジェクト作成
2. PostgreSQLアドオン追加（DATABASE_URLが自動設定される）
3. 環境変数をRailway管理画面で設定（最低: DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL, ENCRYPTION_KEY, APP_URL, NODE_ENV）
4. GitHubリポジトリ連携で push → 自動ビルド
5. `nixpacks.toml` に従いビルド → 起動時 `npm start`（= `prisma db push --accept-data-loss && next start`）でスキーマ同期
6. 初回のみ Railway の **Console** タブで `npm run db:seed`
7. Settings → Networking でドメイン生成（`NEXTAUTH_URL`/`APP_URL` の解決に必要）

> Node固定（`.node-version=22.15.0`）/ devDeps込みインストール（`--include=dev`）/ 遅延初期化など、デプロイ上の判断は [docs/DECISIONS.md](docs/DECISIONS.md) を参照。Stripe/S3/SMTP は未設定でも起動可（該当機能利用時に設定）。

## Stripe設定

1. Stripe DashboardでWebhookエンドポイント登録: `https://your-domain.com/api/stripe/webhook`
2. 必要なイベント:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `payment_method.attached`

## セキュリティ設計

- **個人情報**: AES-256-GCM暗号化（DB保存時）
- **パスワード**: bcrypt rounds=12
- **管理画面**: NextAuth JWT + 2FA (TOTP/speakeasy)
- **Stripe**: カード番号・CVCは一切保存しない（Stripe側のみ）
- **オフセッション課金**: Upcharge時にStripe保存済みPaymentMethodで自動課金
- **S3**: プリサイン付きURLで直接アップロード（サーバー経由不要）
- **操作ログ**: 管理者全操作をoperation_logsテーブルに記録

## 利益計算

- PSA公表価格の**80%**がトレカビンクスの仕入コスト（ディーラーレート）
- ServicePriceに設定する`pricePerCard`が顧客請求額
- 利益 = `pricePerCard - (PSA公表価格 × 0.8) + agencyFee`
