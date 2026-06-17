# SECURITY — セキュリティ設計

> 本書のルールは [AGENTS.md §5] と対。実装変更時は両方を保つ。
> 最終更新: 2026-06-18

---

## 1. 個人情報（PII）の保護
- 氏名・フリガナ・電話・都道府県・住所・建物名は **AES-256-GCM** でアプリ層暗号化（`src/lib/crypto.ts`）。
- 暗号化キーは `ENCRYPTION_KEY`（32byte = 64hex）env。`crypto.getKey()` で遅延取得（モジュールトップで評価しない）。
- DBには `*Encrypted` 列で保存。読取時は必ず `decrypt()` を通す。
- `email`・`postalCode` は検索性のため平文（PIIだが業務上の判断）。
- ⚠️ **キーをローテーションすると既存データは復号不可**。鍵変更は移行計画とセットで（[DECISIONS ADR-0002]）。

## 2. 認証・認可
- 管理者/スタッフ: NextAuth v5（JWT, Credentials）。`User.passwordHash` を bcrypt 照合。
- 顧客: 自前cookieセッション（`customer_session`, httpOnly/secure(prod)/sameSite=lax, 30日, `CustomerSession`テーブル）。
- 認可は **ページ/レイアウト/Server Action 側で実施**（middlewareでは行わない＝Edge制約 / [ADR-0005]）。
  - 管理操作: `requireAdmin`（ログイン必須）/ `requireAdminOrStaff`（role∈{ADMIN,STAFF}）/ 料金設定はADMINのみ。
  - 顧客操作: `getCustomerSession()` で本人確認、他人のリソースにアクセスさせない（`where: { …, customerId }`）。
- パスワードは **bcrypt rounds=12**。最小長8（zod）。
- 2FA(TOTP/speakeasy): 足場のみで **未配線**（[TASKS.md] 優先度高）。

## 3. 決済セキュリティ（Stripe）
- **カード番号・CVC・生の決済情報を保存しない**（Stripe側のみ）。保存可: `stripeCustomerId`/`stripePaymentMethodId`/`brand`/`last4`/各種ID。
- Webhookは署名検証必須（`constructWebhookEvent` / `STRIPE_WEBHOOK_SECRET`）。
- オフセッション課金（Upcharge）は保存済みデフォルトカードのみ。失敗は `UpchargeStatus.FAILED` に記録。
- 金額は円・整数で扱う。

## 4. ストレージ（S3）
- 画像は **presigned URL で直アップロード**（サーバ経由しない）。presign発行は顧客セッション必須。
- バケット名・認証情報は env（`AWS_*`）。

## 5. 監査ログ
- 管理操作・顧客操作を `OperationLog` に記録（`logOperation`）。`before`/`after` をJSON保存。
- 記録項目: userId/customerId, ipAddress, action, targetType/targetId, userAgent。

## 6. 通信・ヘッダ
- `src/middleware.ts` で全レスポンスに付与: `X-Content-Type-Options: nosniff` / `X-Frame-Options: DENY` / `X-XSS-Protection` / `Referrer-Policy: strict-origin-when-cross-origin`。
- 本番はHTTPS（Railwayドメイン）。cookieは本番で `secure`。

## 7. シークレット管理
- `.env` は **コミット禁止**（`.env.example` のみ）。
- シークレットを **コード・ログ・エラーメッセージ・コミットに出さない**。
- 本番値（`ENCRYPTION_KEY`/`NEXTAUTH_SECRET`/Stripe/AWS/SMTP）は Railway の Variables で管理。

## 8. 入力検証・インジェクション対策
- 外部入力は **zod 必須**。
- DBは Prisma のパラメタライズ（生SQLは原則使わない。使う場合は `$queryRaw` のテンプレートで）。
- 出力は React の自動エスケープに従う（`dangerouslySetInnerHTML` を安易に使わない）。
- メールHTMLにユーザー入力を埋める箇所（`mailer.ts`）は値の出所に注意。

## 9. 既知の課題 / TODO（[TASKS.md] と同期）
- 🔴 管理者2FAの配線
- 🟡 レート制限・CSRF対策の明文化（未整備）
- 🟡 本番テスト用パスワード（`Admin1234!`等）の変更
- 🟡 監査ログの保持期間・アクセス制御ポリシー未定義

---

## AIエージェントへの厳守事項
PII暗号化 / bcrypt / 操作ログ / 認可（require*・getCustomerSession）/ Stripe非保存 / middleware非認可 —
**これらを壊す変更は人間承認なしに行わない**（[AGENTS.md §5,§7]）。新規Action/APIは認可とログを必ず入れる。
