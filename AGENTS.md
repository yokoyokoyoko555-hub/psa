# AGENTS.md — AI開発者（Claude Code / Codex）向けガイド

このプロジェクトは **Claude Code と Codex の併用開発**。すべてのAIエージェントは本書に従うこと。
人間のレビュー前提で動き、判断に迷ったら勝手に進めず TODO/質問を残す。

最終更新: 2026-06-18

---

## 1. プロジェクト概要

トレカビンクス（株式会社ツルプルン）向け「PSA鑑定受付代行」Webシステム。
作業前に参照: [ARCHITECTURE](docs/ARCHITECTURE.md) / [DATABASE](docs/DATABASE.md) / [API](docs/API.md) / [SECURITY](docs/SECURITY.md) / [TASKS](docs/TASKS.md) / [DECISIONS](docs/DECISIONS.md)。

- スタック: Next.js 15 (App Router) / TypeScript strict / Prisma 7 + PostgreSQL / NextAuth(管理) + 自前cookie(顧客) / Stripe / AWS S3 / Railway
- リポジトリルート: `psa-system/`（GitHub: yokoyokoyoko555-hub/psa, master自動デプロイ）

---

## 2. コーディング規約

- **言語/型**: TypeScript strict。`any` 禁止（やむを得ない場合は `unknown` + narrowing）。型は明示。
- **既存スタイルに合わせる**: 周辺コードの命名・構造・コメント密度に倣う。独自フォーマットを持ち込まない。
- **Server Actions 優先**: mutationは原則 `src/actions/` のServer Action。RESTルートは外部連携/特殊用途のみ。
- **入力検証は zod 必須**: 外部入力（フォーム/API）は必ず zod でパース。`safeParse` 失敗時はユーザ向けエラーを返す。
- **DBアクセスは `src/lib/prisma.ts` の `prisma` のみ**を使う（新規 `new PrismaClient()` 禁止。seedは例外でアダプタ明示）。
- **環境変数依存モジュールは遅延初期化**（`getStripe()`/`getS3()`/`crypto.getKey()` の形）。モジュールトップレベルで `process.env.X!` を評価しない（ビルドが落ちる）。
- **PII** は必ず `crypto.ts` の `encrypt`/`decrypt` を通す。生の氏名/住所/電話をDBに書かない。
- **日本語UI**。ユーザー向け文言・エラーは日本語。
- **コメント**は「なぜ」を書く。自明な「何を」は書かない。
- 変更後は §8 のビルド/型チェックを通すこと。lint warning は増やさない。

---

## 3. DB変更ルール

- **`prisma/schema.prisma` が単一の真実**。スキーマ変更はここを編集する。
- 本番は **`prisma db push`** でスキーマ同期している（マイグレーションファイルは未運用）。
  - 破壊的変更（列削除・型変更・必須化）は **データ損失リスク** を必ず人間に確認してから。`--accept-data-loss` が前提の運用である点に注意。
- enum値の削除は既存データを壊しうる。**追加は可、削除は要相談**。
- マイグレーション運用へ移行する場合は §DECISIONS に記録し、人間承認を得てから。
- 変更したら `docs/ARCHITECTURE.md`(§4) と `docs/DATABASE.md` を更新する。

---

## 4. Stripe利用ルール

- **カード番号・CVC・生の決済情報をDBや当社サーバに保存しない**（Stripe側のみ）。保存してよいのは `stripeCustomerId` / `stripePaymentMethodId` / `brand` / `last4` / 各種ID。
- Stripeアクセスは必ず `src/lib/stripe.ts`（`getStripe()` / 既存ヘルパ）経由。`new Stripe()` を散らさない。
- APIバージョンは `2025-02-24.acacia` で固定。勝手に変えない。
- 金額は **円・整数**（最小単位）で扱う。小数を持ち込まない。
- オフセッション課金（Upcharge）は保存済みデフォルトカードに対してのみ。失敗時は `UpchargeStatus.FAILED` を記録し、握りつぶさない。
- Webhookは署名検証必須（`constructWebhookEvent`）。イベント追加時は冪等性に注意。

---

## 5. セキュリティルール

- PII暗号化（AES-256-GCM）・bcrypt(12)・操作ログ(`logOperation`)の3点を壊さない。
- 認可を必ず通す: 管理操作は `requireAdmin`/`requireAdminOrStaff`、顧客操作は `getCustomerSession`。新規Action/APIで認可漏れを作らない。
- `ENCRYPTION_KEY` / `NEXTAUTH_SECRET` / Stripeキー等のシークレットを **コード・ログ・コミットに出さない**。`.env` はコミット禁止。
- middlewareはEdgeランタイム。Node `crypto`/Prisma/`auth()` を import しない（ビルド/起動が壊れる）。認可はページ/レイアウト/Action側で。
- ユーザー入力をSQL/HTML/URLに直接埋め込まない（PrismaのパラメタライズとReactのエスケープに従う）。
- 個人情報・秘密情報を外部サービスへ送信しない。

---

## 6. テストルール

- **現状テストフレームワークは未導入**（§TASKS）。テストを追加する場合:
  - まず人間に方針確認（Vitest + Playwright 等）。導入は §DECISIONS に記録。
  - 料金計算(`fee-calculator`)・採番・暗号化・認可など **純ロジックのユニットテストを優先**。
  - 外部依存（Stripe/S3/SMTP/DB）はモック化。本番キーやライブDBに接続しない。
- 既存挙動を変える変更には回帰テストを添える。テストなしの「動くはず」で完了報告しない。
- 最低限、変更後は §8 のビルド+型チェックが通ることを確認。

---

## 7. 仕様変更禁止ルール（重要）

AIは **勝手に仕様を変えない**。以下は人間の承認なしに行わない:

- 料金計算ロジック（税率10%、PSA原価80%、送料/保険の帯）の変更
- カードステータスの17段階フローの増減・意味変更
- 認証方式（管理=NextAuth / 顧客=cookie）の置換
- 決済フロー・Stripeの課金タイミングの変更
- DBスキーマの破壊的変更、enumの削除
- ロール権限モデル（ADMIN=全機能 / STAFF=料金設定以外）の変更
- 公開API/ルートの削除・パス変更

「リファクタのついで」での挙動変更も禁止。挙動を変える場合は **目的・影響・代替案を提示して承認を得る**。
不明点は実装を読んで確認し、それでも曖昧なら質問を残す（推測で進めない）。

---

## 8. 実行コマンド一覧

> Google Drive(G:)上では `npm install` が壊れる。ローカルドライブ(C:)へコピーして実行すること。

| 目的 | コマンド |
|------|---------|
| 依存インストール | `npm install --legacy-peer-deps --include=dev` |
| 開発サーバ | `npm run dev` |
| 本番ビルド | `npm run build`（= `prisma generate && next build`） |
| 本番起動 | `npm start`（= `prisma db push --accept-data-loss && next start`） |
| 型チェック | `npx tsc --noEmit` |
| Lint | `npm run lint` |
| Prismaクライアント生成 | `npm run db:generate` |
| スキーマDB同期(push) | `npm run db:push` |
| Prisma Studio | `npm run db:studio` |
| 初期データ投入 | `npm run db:seed` |

### デプロイ / 運用
- master へ push すると Railway が自動ビルド・デプロイ
- 本番DBへのseed等は Railway の **Console** タブで `npm run db:seed`
- healthcheck: `GET /api/health`（`SELECT 1`）

---

## 9. 作業の進め方（Claude Code / Codex 共通）

1. 着手前に ARCHITECTURE / TASKS / DECISIONS を読む
2. 影響範囲を確認（grep）。仕様変更に当たらないか §7 で照合
3. 最小差分で実装。既存スタイルに合わせる
4. ビルド+型チェック（§8）を通す
5. 重要な設計判断をしたら `docs/DECISIONS.md` に追記（§DECISIONSの手順）
6. 実装状況が変わったら `docs/TASKS.md` を更新
7. 人間向けに「変更点・理由・残課題・テスト結果」を簡潔に報告
