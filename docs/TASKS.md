# TASKS — 実装状況と残タスク

> 凡例: ✅ 実装済 / 🟡 部分実装・要改善 / ❌ 未実装
> 最終更新: 2026-06-18。タスク着手・完了時はこの表を更新すること。

---

## 実装済み機能

### 顧客向け
- ✅ 会員登録（PII暗号化保存・Stripe Customer作成）`register`
- ✅ ログイン / ログアウト（cookieセッション）
- ✅ PSA申込フォーム（カード入力→サービス選択→確認→決済の多ステップ）`apply`
- ✅ 料金自動計算（PSA料金・代行手数料・送料・保険料・消費税）`fee-calculator`
- ✅ 電子同意書の記録（IP/UA/本文スナップショット）
- ✅ マイページ（申込一覧・詳細・カード進捗表示）
- ✅ 保存カード一覧・削除 `payment-methods`
- 🟡 申込時の決済UI（**Stripe Elements がプレースホルダ。実カード決済は未完**）

### 管理者/スタッフ向け
- ✅ 管理ログイン（NextAuth JWT）
- ✅ ダッシュボード集計（申込数・PSA待ち・未払い・Upcharge等）
- ✅ 顧客一覧・詳細
- ✅ 申込一覧・詳細
- ✅ カード一覧（検索・絞り込み・ページング）・詳細
- ✅ カードステータス更新（履歴記録つき）
- ✅ PSA提出グループ作成・提出登録
- ✅ グレード結果登録（cert no / grade）
- ✅ Upcharge作成（メール通知 + 保存カードへ自動オフセッション課金）
- ✅ 料金/送料/保険料の設定（ADMINのみ）
- ✅ 自身のパスワード変更（`/admin/account`、現在パスワード照合 + 操作ログ）

### 基盤
- ✅ 採番（APP-/CARD-/PSG-、日付+連番）
- ✅ 操作ログ記録
- ✅ S3 presigned URL アップロード（API）
- ✅ QRコード生成（API）
- ✅ Stripe Webhook（succeeded/failed/method.attached）
- ✅ メール送信基盤（nodemailer）+ Upcharge通知テンプレート
- ✅ Railway本番デプロイ・稼働（healthcheck `/api/health`）

---

## 未実装・要改善

### 優先度: 高
- 🟡 **メール認証（新規登録）** — フロー実装済み（メール入力→確認リンク24h→登録）。`EmailVerification` トークン管理。**SMTP未設定時はテスト用に画面へリンク表示**、SMTP設定で自動的にメール送信に切替。本番ではSMTP設定が必要
- ❌ **強力なBot対策** — 現状はハニーポット（キー不要）のみ実装済み。reCAPTCHA / Cloudflare Turnstile を入れる場合はサイトキー＋シークレットが必要
- 🟡 **代理申込の決済通電** — 画面・データ・フローは実装済み（顧客の依頼→管理「要対応」→店舗入力→確定）。残りは「依頼時のカード登録(案A)」と「確定時の登録カードへ off_session 即時決済」で、いずれも Stripe Elements 統合に依存（[ADR-0011](DECISIONS.md)）
- ❌ **PSA US の正式料金** — 現在JPと同額の暫定値。管理画面→設定で正式値に更新
- ❌ **Stripe Elements 統合**（通常申込の決済 + 代理のカード登録/即時決済の前提）（`ApplyForm.tsx` の payment ステップを実決済に。`@stripe/react-stripe-js`/`@stripe/stripe-js` 導入、`Elements` プロバイダ、`confirmCardPayment` 実装）
- ❌ **管理者2FA(TOTP)の配線**（`speakeasy` 利用。QR発行→検証→ログインフローへ組込み。現状UIのみ）
- ❌ **本番シークレットの差し替え**（テスト用パスワード `Admin1234!` 等、`ENCRYPTION_KEY`/`NEXTAUTH_SECRET` の本番値確認）
- 🟡 **Stripp/S3/SMTP の本番接続**（env未設定。決済・画像アップロード・メールを使う前に設定）

### 優先度: 中
- 🟡 申込フォームの一時保存はlocalStorage実装（同一端末のみ復元可）。複数端末で再開するならDBドラフト化が必要
- ❌ 顧客側のパスワード変更（管理側は実装済み。Customer向けは未実装）
- ❌ 顧客プロフィール編集（住所変更等）
- ❌ お知らせ/通知（`Notification` モデルはあるが画面・配信未実装）
- ❌ 返却配送の追跡番号入力・顧客通知
- ❌ メール文面の拡充（申込受付・グレード確定・返却完了など。現状Upchargeのみ）
- ❌ 管理画面のCSV/帳票出力（売上・PSA提出リスト）
- 🟡 ACCOUNTING（経理）ロールの権限設計（現状 requireAdminOrStaff から除外され中途半端。経理専用画面が必要か要判断。※運用は ADMIN/STAFF の2ロールに集約済み）

### 優先度: 低 / 技術的負債
- 🟡 `railway.json` の `startCommand` が旧 `prisma migrate deploy && npm start` のまま（現状は `npm start` 内の `db push` で実害なし。整理推奨。§DECISIONS-0006）
- ❌ マイグレーション運用の確立（現状 `db push`。本番データ保護のため将来は `prisma migrate` へ移行検討）
- ❌ 自動テスト（ユニット/E2E）一式 — **現状テストフレームワーク未導入**
- 🟡 未使用import等のlint warning整理（ビルドは通る）
- ❌ レート制限・CSRF対策の明文化
- ❌ `pg-native` 解決不可の警告（動作影響なし。抑制検討）

---

## 既知の制約・注意
- Google Drive（G:ドライブ）上では `npm install` が壊れる → ローカルドライブ(C:)へコピーしてビルド
- Prisma v7: schema に `url` 不可、`db push` は `--skip-generate` 非対応
- middleware は Edge ランタイム → Node `crypto`/Prisma を import 不可
