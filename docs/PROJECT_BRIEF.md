# PROJECT BRIEF — Codex 引き継ぎ用 一枚要約

> このファイルだけで概要を把握できるようにまとめた要約。詳細は各リンク先へ。
> 最終更新: 2026-06-18

## これは何か
トレカビンクス（株式会社ツルプルン）の **PSA鑑定受付代行Webシステム**。
顧客がトレカのPSA鑑定をオンライン申込→Stripe決済→17段階ステータスで進捗管理。スタッフが検品・PSA提出・グレード登録・返却・追加請求(Upcharge)を運用する。
本番稼働中: https://psa-production-a106.up.railway.app

## 開発体制
**Claude Code と Codex の併用**。作業前に [AGENTS.md](../AGENTS.md) を必読。重要な設計判断は [DECISIONS.md](DECISIONS.md) に追記する。

## スタック（要点）
Next.js 15 (App Router) / TypeScript strict / Tailwind v4 / Prisma 7 + `@prisma/adapter-pg` + PostgreSQL / 認証=NextAuth(管理) + 自前cookie(顧客) / Stripe / AWS S3 / nodemailer / Railway(Nixpacks)。
リポジトリルート `psa-system/`（GitHub: yokoyokoyoko555-hub/psa, master自動デプロイ）。

## コードの歩き方
- `prisma/schema.prisma` … DBの単一の真実（16モデル）
- `src/actions/` … mutationの主役（Server Actions: customer / application / admin / payment）
- `src/app/` … 画面（公開 / `mypage` / `admin` / `api`）
- `src/lib/` … prisma, auth, customer-auth, crypto(PII暗号), stripe, s3, mailer, fee-calculator, number-generator, operation-log
- `src/middleware.ts` … セキュリティヘッダのみ（Edge、認可しない）

## 押さえるべき設計（蒸し返さない）
1. **認証は二系統**: 管理=NextAuth(JWT) / 顧客=cookieセッション（[ADR-0001]）
2. **PIIはAES-256-GCM暗号化**、bcrypt(12)、全操作を`operation_logs`に記録（[ADR-0002]）
3. **Prisma v7 + driver adapter**。schemaに`url`不可、CLIは`prisma.config.js`の`datasource.url`（[ADR-0003]）
4. **スキーマ同期は`db push`**（migrate未運用、破壊的変更はデータ損失注意）（[ADR-0004]）
5. **middlewareで認可しない**（Edge制約）。認可はページ/レイアウト/Action側（[ADR-0005]）
6. **env依存は遅延初期化**（getStripe/getS3/crypto.getKey、DBページは force-dynamic）（[ADR-0007]）
7. **管理ロールは ADMIN / STAFF の2種**（ADMIN=全機能, STAFF=料金設定以外）（[ADR-0008]）
8. 金額は**円・整数**。料金=PSA料金+代行手数料+送料+保険+消費税10%。仕入はPSA公表価格の80%。

## 重要な未完（[TASKS.md](TASKS.md) 参照）
- 🔴 **申込フォームのStripe Elementsがプレースホルダ**＝実カード決済が未完成
- 🔴 管理者2FA(TOTP)が未配線（UIのみ）
- 🟡 Stripe/S3/SMTP の本番env未設定（遅延初期化のため未設定でも起動はする）
- 🟡 テストフレームワーク未導入
- 🟡 `railway.json`の`startCommand`に旧`migrate deploy`が残存（no-opで実害なし、要整理）

## やってはいけないこと（[AGENTS.md §7]）
料金ロジック / ステータス17段階 / 認証方式 / 決済フロー / DB破壊的変更 / ロール権限 / 公開ルート —
これらの**仕様変更は人間承認なしに行わない**。リファクタのついでの挙動変更も禁止。

## よく使うコマンド
```bash
npm install --legacy-peer-deps --include=dev   # 依存（G:ドライブ不可→C:でビルド）
npm run dev            # 開発
npm run build          # 本番ビルド(prisma generate && next build)
npx tsc --noEmit       # 型チェック
npm run lint           # Lint
npm run db:push        # スキーマ同期
npm run db:seed        # 初期データ
```
本番seed等は Railway の **Console** タブで実行。healthcheck=`GET /api/health`。

## テストアカウント（本番公開前に要変更）
- ADMIN: admin@turupurun.com / Admin1234!
- STAFF: staff@turupurun.com / Staff1234!
- 顧客: test@example.com / Test1234!
