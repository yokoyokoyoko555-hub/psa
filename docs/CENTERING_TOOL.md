# CENTERING_TOOL — センタリング測定ツール 設計書

> Codex / Claude Code 共有用の自己完結ドキュメント。この1枚で機能の全体像・確定方針・実装タスクを把握できる。
> 関連: [ADR-0012](DECISIONS.md) / 規約は [AGENTS.md](../AGENTS.md) / 全体像は [PROJECT_BRIEF.md](PROJECT_BRIEF.md)
> 状態: **Phase 1 実装済 / Phase 0 課金配線は残** / 最終更新: 2026-06-21

---

## 1. これは何か
カメラでトレカの**表裏を撮影し、センタリング（上下・左右の余白比率）を測定**して、PSA基準のおおよその上限グレードを参考表示する顧客向けツール。既存のマイページ（`/mypage`）に統合する。参考アプリ: AXCI（https://www.axci.ai/ ）。

### プラン体系（ADR-0013で更新）
| プラン | 価格 | 内容 |
|--------|------|------|
| **ライト（手動）** | **無料**（ログインのみ） | 4隅を手動指定＋透視補正。集客の入口 |
| **AI（自動）** | **¥550/月** | AIが端末内でカード枠を自動検出し瞬時に測定。上位互換 |

> **本機能の本丸はPSA鑑定代行（本業）への送客**。無料ライトで集客→AIで体験向上→**測定結果画面の「このカードをPSA鑑定に申し込む」CTA（`/apply`）で本業へ誘導**する設計（ADR-0013）。
> AIエンジンは**端末内（CV→ML）**でAPI原価ゼロ。課金ゲートは「ツール全体」ではなく**AIの自動検出機能のみ**。`CenteringMeasurement.method`（MANUAL/AI）で手段を記録。

### 確定方針（2026-06-21、ユーザー承認済み）
| 論点 | 採用 | 補足 |
|------|------|------|
| 測定エンジン | **オンデバイスCV＋手動補正** | ブラウザ内で自動検出→ガイド線をユーザーが微調整して確定。推論コストなし・プライバシー◎ |
| 課金UI | **Stripe Checkout（subscription）＋ Customer Portal** | 加入はCheckout、解約/カード変更はPortal。SCA・解約UIを内包し最小実装 |
| 画像の扱い | **測定値のみDB保存／撮影画像は端末内で処理し破棄** | S3保存・アルバム化はしない（将来Phase2で再検討） |

### 免責（必須）
当社はPSA鑑定の代行業者であるため、結果画面に必ず明示する:
> 本測定は参考値であり、PSA等の鑑定会社による公式判定を保証するものではありません。

---

## 2. センタリング測定の定義（測定ロジックの核心）
PSAのセンタリングは「**外周**（カードの物理的な縁）」と「**内枠**（印刷フレーム/デザインの縁）」という2つの長方形を検出し、対辺の余白を比較して求める。

```
左余白 ─┐        ┌─ 右余白
        ┌────────────┐   ← 外周(card edge)
        │ ┌────────┐ │   ← 内枠(print frame)
        │ │  art   │ │
        │ └────────┘ │
        └────────────┘
```

| 指標 | 計算式 | 例 |
|------|--------|----|
| 左右 (L/R) | 左余白 ÷ (左余白 + 右余白) × 100 | 左52,右48 → 52/48 |
| 上下 (T/B) | 上余白 ÷ (上余白 + 下余白) × 100 | 上57,右43 → 57/43 |

数値は「大きい側/小さい側」に正規化して表示（例: 52/48）。

### 参考グレード対応表（フロント基準・設定可能なリファレンス値）
| 上限グレード | フロント許容 | バック許容 |
|--------------|--------------|------------|
| PSA 10 | 55/45 | 75/25 |
| PSA 9  | 60/40 | 90/10 |
| PSA 8  | 65/35 | 90/10 |
| PSA 7  | 70/30 | 90/10 |
| PSA 6  | 75/25 | — |

> 上表は一般に知られる目安。**あくまで参考値**であり、表面/角/エッジ/印刷など他要素は評価しない。閾値は将来管理画面で調整可能にできるよう、コード内に定数表として持つ（ハードコードを1箇所に集約）。

### 測定処理フロー（1枚あたり、すべてクライアント＝ブラウザ内）
1. **外周検出**: 背景（白/黒紙推奨）とのコントラストで最大の四角形（カード輪郭）を検出。
2. **透視補正(warp)**: 斜め撮影を平面の長方形に正規化。
3. **内枠検出**: エッジ抽出＋投影プロファイルでフレームの強い直線を推定。
4. **手動補正**: 検出した外周・内枠のガイド線をユーザーがドラッグ微調整して確定（フルアート/ボーダーレス対策）。
5. **算出**: 4辺の余白から L/R・T/B を計算し、対応表で参考グレードを判定。
6. 結果を保存（数値のみ）。撮影画像は破棄。

---

## 3. アーキテクチャ
```
[ブラウザ] getUserMedia(背面カメラ)
   └ Canvas で画像処理（外周/内枠検出・warp・余白計測）  ← 画像はここから出ない
        └ 数値結果のみ Server Action へ送信
             └ DB: CenteringMeasurement 保存
[Stripe] Checkout(subscription) / Customer Portal
   └ Webhook → Subscription レコード更新 → 利用可否ゲート
```
- 画像処理は外部送信なし。サーバには L/R・T/B 等の**数値のみ**を渡す。
- 実装は軽量CVを基本とし、必要に応じ OpenCV.js(WASM) を遅延ロード（バンドル肥大を避け、ツール画面でのみ読込）。

---

## 4. データモデル（追加）
スキーマは `prisma/schema.prisma` に追記。Railway起動時の `db push`（[ADR-0004]）で反映。**新規テーブル追加のみ＝データ損失なし**。

### enum SubscriptionStatus
`ACTIVE` / `TRIALING` / `PAST_DUE` / `CANCELED` / `INCOMPLETE` / `INCOMPLETE_EXPIRED` / `UNPAID`
（Stripeのsubscription.statusに対応）

### model Subscription（汎用サブスク。将来他プランにも流用可）
| フィールド | 型 | 説明 |
|-----------|----|----|
| id | String @id cuid | |
| customerId | String | `Customer` への relation |
| stripeSubscriptionId | String @unique | Stripe sub_xxx |
| stripePriceId | String | どのプランか |
| status | SubscriptionStatus | |
| currentPeriodEnd | DateTime | 利用可否判定に使用 |
| cancelAtPeriodEnd | Boolean @default(false) | 期末解約予約 |
| createdAt / updatedAt | DateTime | |

`Customer` に `subscriptions Subscription[]` を追加。`@@map("subscriptions")`。

### model CenteringMeasurement
| フィールド | 型 | 説明 |
|-----------|----|----|
| id | String @id cuid | |
| customerId | String | relation |
| cardId | String? | 任意で登録カードに紐付け（履歴表示用） |
| frontLR / frontTB | Float | フロントの左右/上下比率（大きい側%） |
| backLR / backTB | Float? | バック（撮影任意） |
| estimatedGrade | String? | 参考上限グレード（"10","9"... or "—"） |
| note | String? | メモ |
| createdAt | DateTime @default(now) | |

`@@map("centering_measurements")`、`@@index([customerId])`。画像列は持たない（方針通り）。

---

## 5. 課金フロー（Stripe Subscription）
現状は単発PaymentIntent＋オフセッション課金のみ（[ADR-0011]近辺）。**継続課金は新規**。

### 加入
1. 顧客が `/mypage/centering` で「加入する（¥550/月）」 → Server Action `createCenteringCheckoutSession()`
2. Stripe Checkout（`mode: "subscription"`, `customer: stripeCustomerId`, `line_items: [{ price: STRIPE_CENTERING_PRICE_ID, quantity: 1 }]`, success/cancel URL）を作成し遷移。
3. 決済完了 → Stripe Webhook で `Subscription` 作成/更新。

### 管理・解約
- `createBillingPortalSession()` → Stripe Customer Portal へ（解約・支払い方法変更）。自前の解約UIは作らない。

### Webhook 追加イベント（`/api/stripe/webhook`）
| イベント | 処理 |
|----------|------|
| `checkout.session.completed` | mode=subscription のとき Subscription を upsert |
| `customer.subscription.updated` | status / currentPeriodEnd / cancelAtPeriodEnd を更新 |
| `customer.subscription.deleted` | status=CANCELED |
| `invoice.paid` | currentPeriodEnd 更新（継続課金成功） |
| `invoice.payment_failed` | status=PAST_DUE 等に更新 |

> 既存 webhook は `payment_intent.*` / `payment_method.attached` のみ処理。subscription/invoice 系を**追記**する（既存分岐は変更しない）。

### 利用可否ゲート
`requireActiveSubscription(customerId)`:
- `status ∈ {ACTIVE, TRIALING}` かつ `currentPeriodEnd > now` を満たす Subscription があれば許可。
- ツールの各ページ/Server Action 冒頭で判定（[ADR-0005] に倣いページ/Action側で認可）。

---

## 6. 画面・ルート
| ルート | 種別 | 内容 |
|--------|------|------|
| `/mypage` | 既存に追記 | クイックアクションに「センタリング測定」カード（サブスク状態バッジ） |
| `/mypage/centering` | 新規 | 未加入→プラン案内＋加入ボタン／加入済→新規測定＋履歴一覧 |
| `/mypage/centering/measure` | 新規(client) | 撮影フロー（表→裏、ガイド枠、自動検出→微調整→確定→結果保存） |
| `/mypage/centering/[id]` | 新規 | 結果詳細（オーバーレイ図＋数値＋参考グレード＋免責） |
| 解約/支払い管理 | 外部 | Stripe Customer Portal |

---

## 7. 撮影/測定UXフロー（Phase 1）
1. ツール開始 → 背面カメラ起動（`getUserMedia({ video: { facingMode: "environment" } })`, `playsInline`）。
2. 画面にカード型ガイド枠＋「白/黒の紙の上」「四隅を枠内」「平行・真上から」の注意表示。
3. **表を撮影** → 自動で外周/内枠検出 → ガイド線をドラッグ微調整 → 「確定」。
4. **裏を撮影**（任意でスキップ可）→ 同様に確定。
5. 結果表示: 表 L/R・T/B、裏 L/R・T/B、参考上限グレード、オーバーレイ図、免責。
6. 「保存」で `CenteringMeasurement` 作成（任意で登録カードに紐付け）。

iOS Safari注意: `getUserMedia` はHTTPS必須（本番は充足）、`<video playsInline muted>` 必須。権限拒否時のフォールバック（ファイル選択アップロードでも測定可）を用意。

---

## 8. 実装タスク（Phase別）
### Phase 0 — 課金基盤＋導線（測定なし）
- [x] `schema.prisma`: `SubscriptionStatus` enum・`Subscription` モデル追加、`Customer` に relation（モデルのみ先行）
- [ ] `lib/stripe.ts`: `createCheckoutSubscriptionSession()` / `createBillingPortalSession()`
- [ ] `actions/subscription.ts`: 加入・Portal（`hasCenteringAccess()` は `actions/centering.ts` に実装済）
- [ ] `/api/stripe/webhook`: subscription/invoice イベント追記
- [x] `/mypage/centering`: 未加入/加入済の出し分け（**加入ボタンは現状 disabled「まもなく提供」**。Stripe配線で有効化）
- [x] `/mypage`: クイックアクションに導線
- [ ] env `STRIPE_CENTERING_PRICE_ID`、操作ログ（加入/解約）

### Phase 1 — 撮影＋測定（実装済）
- [x] `/mypage/centering/measure`（client）: カメラ・ガイド枠・撮影・フォールバックアップロード
- [x] 画像処理: 外周/内枠を**4隅指定（台形対応）→ ホモグラフィで透視補正 → 余白算出**（`centeringFromQuads`）。操作は「外周→内枠」2ステップ＋拡大ルーペ
- [x] **AI自動検出（OpenCV.js, 端末内）**: 撮影後に外周＝最大の四角輪郭、内枠＝同心の四角輪郭を自動検出し四隅へ反映（`lib/opencv-loader.ts` / `lib/centering-detect.ts`）。失敗時は手動既定値にフォールバック。AIプラン(`aiEnabled`)時のみ自動実行＋「AIで自動検出し直す」ボタン
- [x] 参考グレード対応表（`lib/centering.ts` 定数）＋判定（純関数）
- [x] `actions/centering.ts`: `saveCenteringMeasurement()`（数値のみ）
- [x] `/mypage/centering/[id]` 結果詳細＋免責、履歴一覧
- [x] ゲート（`hasCenteringAccess`）を全ページ/Actionに適用。**Stripe未配線のため `CENTERING_DEV_UNLOCK=true` で開放**

> Phase 1（手動）＋AI自動検出（OpenCV.js 端末内）まで実装済み。手動測定は無料で全ログインユーザーに開放、AI自動検出は `aiEnabled`（サブスク or `CENTERING_DEV_UNLOCK=true`）時のみ。Stripeサブスク配線（Phase 0）は引き続き残。OpenCV.js は `https://docs.opencv.org/4.10.0/opencv.js` をAI測定時のみ遅延ロード（CSP無しのため読込可）。内枠の自動検出精度向上（フルアート対応のML化）は将来課題。

### Phase 2 — 付加価値（将来・任意）
- [ ] 内枠自動検出の精度向上（ML/セグメンテーション検討は新ADR）
- [ ] 価格参考表示（データソース確保が前提）
- [ ] PDF/画像での結果共有
- [ ] 閾値の管理画面編集

---

## 9. 環境変数（追加）
| 変数 | 説明 |
|------|------|
| `STRIPE_CENTERING_PRICE_ID` | ¥550/月の継続Price ID（Stripeで作成・Phase 0で使用） |
| `CENTERING_DEV_UNLOCK` | `true` でサブスク判定をスキップし測定ツールを開放（Stripe配線前の動作確認用）。本番でサブスク運用開始時は外す |

既存の `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `APP_URL`(or `NEXTAUTH_URL`) を利用。**本番Stripeキーが未設定なら継続課金は動かない**（遅延初期化のため起動は可）。

### 人間側の事前作業（Stripe管理画面）
1. 商品「センタリング測定ツール」＋ Price ¥550 JPY・月次 recurring を作成 → Price ID取得
2. Railwayに `STRIPE_CENTERING_PRICE_ID` を設定
3. Customer Portal を有効化（解約・支払い方法変更を許可）
4. Webhookに subscription/invoice 系イベントを追加（§5）

---

## 10. セキュリティ・法務・リスク
- **免責表記必須**（§1）。参考値である旨を結果画面・プラン案内に明示。
- 撮影画像はサーバ送信せず端末内処理（プライバシー）。
- 操作ログ（[ADR-0002] の `operation_logs`）に加入・解約・測定保存を記録。
- リスク: **内枠自動検出の精度**（フルアート系）→ 手動補正UIと「対応カードの目安」明記で緩和。
- リスク: 継続課金は新規実装 → Checkout＋Portal採用で工数最小化。Webhook失敗時の整合性は `currentPeriodEnd` 基準のゲートで吸収。

## 11. 未決事項（実装前に確認）
- 参考グレード閾値の最終値（上表で進めてよいか）。
- 無料トライアル有無（Checkoutで `trial_period_days` 付与可）。
- 解約済ユーザーの過去測定履歴の閲覧可否（推奨: 閲覧は可、新規測定は不可）。

## やってはいけないこと（[AGENTS.md §7] 準拠）
既存の料金ロジック / ステータス17段階 / 認証方式 / 既存決済フロー / DB破壊的変更 を本機能の実装で変更しない。subscription/invoice の webhook 分岐は**追記**で行い、既存 `payment_intent.*` 分岐を触らない。
