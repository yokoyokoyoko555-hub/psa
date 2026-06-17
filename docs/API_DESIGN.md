# API設計書

## Server Actions（主要機能）

### 顧客向け

#### `registerCustomer(input)` - 会員登録
- 入力: 氏名・フリガナ・メール・電話・住所・パスワード
- 処理: 個人情報暗号化・bcryptハッシュ・Stripe Customer作成・セッション発行
- 出力: `{ success, error? }`

#### `loginCustomer(input)` - ログイン
- 入力: メール・パスワード
- 処理: bcrypt検証・セッション発行・操作ログ記録
- 出力: `{ success, error? }`

#### `createApplication(input)` - PSA申込作成
- 入力: カード情報配列・サービスレベル・返却方法・同意書情報
- 処理:
  1. 料金計算（自動）
  2. Application・Card・Agreement レコード作成（トランザクション）
  3. Stripe PaymentIntent 作成（setup_future_usage: off_session）
  4. Payment レコード作成
  5. 操作ログ記録
- 出力: `{ success, clientSecret, applicationId, error? }`

#### `getMyApplications()` - 申込一覧取得
- 認証: 顧客セッション必須
- 出力: Application[] with Cards・Payments

#### `getApplicationDetail(id)` - 申込詳細
- 認証: 自分の申込のみ
- 出力: Application with Cards・StatusHistory・Agreement

### 管理者向け

#### `getDashboardStats()` - ダッシュボード統計
- 権限: ADMIN or STAFF
- 出力: `{ total, psaWaiting, psaReturning, unpaid, upchargeCount }`

#### `updateCardStatus(cardId, status, note?)` - カードステータス更新
- 権限: ADMIN or STAFF
- 処理: Card更新・CardStatusHistory作成・操作ログ

#### `createPsaSubmissionGroup(cardIds)` - PSA提出グループ作成
- 権限: ADMIN or STAFF
- 処理: PsaSubmissionGroup作成・Card群に groupId を設定

#### `submitPsaGroup(groupId, params)` - PSA提出登録
- 権限: ADMIN or STAFF
- 処理: グループ・カード群にSubmissionId/OrderIdを設定

#### `recordGrade(cardId, params)` - グレード登録
- 権限: ADMIN or STAFF
- 処理: psaCertNo・psaGrade設定・ステータスを GRADE_AVAILABLE へ

#### `createUpcharge(input)` - Upcharge登録
- 権限: ADMIN or STAFF
- 処理:
  1. Upchargeレコード作成
  2. カードを UPCHARGE_UNPAID へ
  3. 顧客へメール通知
  4. 保存済みカードへ自動請求（off_session）
  5. 成功: UPCHARGE_PAID / 失敗: FAILED

## REST API Routes

### `POST /api/auth/[...nextauth]`
NextAuth v5 ハンドラー（管理者認証）

### `POST /api/stripe/webhook`
Stripe Webhook処理
- `payment_intent.succeeded`: 決済完了 → ステータス更新・PaymentMethod保存
- `payment_intent.payment_failed`: 失敗記録
- `payment_method.attached`: PaymentMethod保存

### `POST /api/s3/presign`
S3 署名付きURL発行（画像アップロード用）
- 認証: 顧客セッション
- 入力: `{ cardId, type: "front"|"back"|"damage", contentType }`
- 出力: `{ uploadUrl, key }`

### `GET /api/qrcode?cardId=...`
QRコード生成・ダウンロード
- 認証: 管理者
- 出力: PNG画像

### `PUT /api/admin/service-prices`
サービス料金更新
- 認証: ADMIN
- 入力: `[{ id, pricePerCard, agencyFee }]`

### `GET /api/health`
ヘルスチェック（Railway用）

## 将来的なPSA API連携設計

現在は手動運用のみだが、以下のエンドポイントでAPI連携に備えた設計:

```typescript
// 将来の実装イメージ
interface PsaApiAdapter {
  createSubmission(cards: Card[]): Promise<{ submissionId: string; orderId: string }>;
  getSubmissionStatus(submissionId: string): Promise<SubmissionStatus>;
  getGrades(submissionId: string): Promise<GradeResult[]>;
}

// 手動実装（現在）
class ManualPsaAdapter implements PsaApiAdapter {
  // 管理画面から手動で入力
}

// PSA API実装（将来）
class PsaApiImplementation implements PsaApiAdapter {
  // https://api.psacard.com/ 連携
}
```
