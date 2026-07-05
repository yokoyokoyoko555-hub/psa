# PROXY_PREPAY — 代理入力の先払いフロー 設計書

> Codex/Claude 共有用。関連: [ADR-0020](DECISIONS.md)（ADR-0011/0014 の代理フローを置換）
> 状態: **設計確定・実装は次フェーズ** / 最終更新: 2026-06-26

## 1. 目的
代理入力（当社がカード明細を入力する申込）を、**先払い化**して取りこぼしを減らす。現行の「依頼→お預け予約→明細入力→後払い」を、**「枚数入力→概算先払い→お預け予約→明細確定→差額追加請求」**に作り替える。

## 2. 新フロー
```
1. 顧客: 代理申込で「サービスレベル別の枚数」を入力（複数レベル同時申込可。[ADR-0024](DECISIONS.md)）
   → 概算 = Σ(サービスレベル別 枚数 × 鑑定料(pricePerCard))（＋税）を Stripe で先に決済
2. 決済後: カードの「持込 or 配送」を予約（既存の提出予約UIを流用）
   ※ 現行「代理申込＝支払い前に予約」は廃止（支払い後に統一）
3. 店舗到着 → スタッフが StoreInputForm で明細入力 → 最終料金確定
4. 差額（最終 − 先払い）を追加請求（Upcharge流用 or 専用）
   → 代理入力完了メール（store_input_completed）送信
```

## 3. 料金
- **先払い**: 枚数 × 鑑定料（＋消費税）。代理入力料金・送料・保険・事務手数料は含めない。
- **代理入力料金**: 「**カードの種類数 × 手数料**」（同一カードは何枚でも1種）。種類数は明細確定後に判明 → 差額側。
- **送料・保険**: 申告価格が必要 → 差額側（明細確定後）。
- **事務手数料**: 差額側（最終に含める）。
- **最終 < 先払い**（例: 実枚数が減）の扱い（返金 or 充当）は実装時に確定（Q2-b）。
- 「同一カード（1種）」の判定基準（カード名＋番号＋言語 等）は実装時に確定（Q2-c）。

## 4. データ/実装インパクト
- `Application` に先払い記録（例: `prepaidAmount Int`、必要なら `estimatedCardCount Int?`）。
- `fee-calculator`: 代理入力料金を**種類数ベース**に（`agencyCardTypeCount` パラメータ等）。現行は枚数ベース。
- `StoreRequestForm`: 「枚数＋サービスレベル入力 → Stripe Elements 先払い」に作り替え（`/apply` の決済サーフェスを移植）。
- 提出予約ゲート: STORE も「支払い済み」を条件に統一（現行のSTORE特例を撤去）。`createStoreRequest` は先払い成立後に予約可へ。
- `submitStoreInput`: 最終料金算出→差額を Upcharge（既存）で請求 or 専用課金。完了メール。
- 既存の「代理申込は支払い前に予約」UI/ロジック（ADR-0014 のSTORE特例）を巻き戻し。

## 5. 留意/未確定（実装着手時に確定）
- 先払いの決済UI（Stripe Elements）は新規サーフェス → **反復テスト前提**。
- 差額請求の手段: 既存 `Upcharge`（オフセッション課金）流用が有力。
- 返金ケース・種類判定基準（§3）。
- Stripeを「ウォレット的」に扱う要否は別調査（TASKS）。先払い＋保存カードで差額オフセッション課金なら、ウォレット不要で実現可。

## 6. 段階
1. ✅ fee-calculator: 種類数ベースの代理入力料金（`calculateFees` に任意 `agencyCardTypeCount` 追加・未指定なら枚数ベースで後方互換）。`submitStoreInput`（admin.ts）が `cards.length`＝カード行数を種類数として渡す。
2. ✅ `StoreRequestForm`: サービスレベル＋枚数入力＋概算先払い決済。`createStoreRequest` が概算(枚数×鑑定料＋税)で PaymentIntent を作成し `clientSecret` を返却、`confirmStorePrepayPayment` で確定（status は DRAFT のまま）。決済UIは共有 `components/StripeCardPayment.tsx`。Application に `prepaidAmount`/`estimatedCardCount` 追加。
3. ✅ 予約ゲートを支払い後に統一（STORE特例撤去）。`submission-booking.ts` と予約ページ2枚（`page.tsx`・`[applicationId]/edit/page.tsx`）で「SUCCEEDED な決済あり」を全 source 共通条件に。
4. `submitStoreInput`: 差額請求＋完了メール（**未実装＝次フェーズ**。現状は最終料金を再計算して上書きするのみ、差額の追加課金はまだ）
