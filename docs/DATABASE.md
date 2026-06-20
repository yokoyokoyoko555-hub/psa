# DATABASE — データベース設計

> `prisma/schema.prisma` が単一の真実。スキーマ変更時は本書も更新する（[AGENTS.md §3]）。
> スキーマ同期は `prisma db push`（migrate未運用 / [ADR-0004]）。
> 最終更新: 2026-06-20

---

## モデル一覧（16）

| モデル / テーブル | 役割 | 主なカラム・ポイント |
|------------------|------|---------------------|
| `User` / users | 管理者・スタッフ | `email`(uniq), `passwordHash`, `role`, `twoFactorSecret`/`twoFactorEnabled`, `isActive` |
| `Customer` / customers | 顧客 | `memberNo`(uniq, B######), 氏名は `lastName`/`firstName`/`lastNameRoman`/`firstNameRoman`(暗号化)+表示用`nameEncrypted`/`nameKanaEncrypted`(自動生成), 他PII=`*Encrypted`, `email`(uniq), `stripeCustomerId`(uniq), `emailVerified` |
| `CustomerSession` / customer_sessions | 顧客セッション | `sessionToken`(uniq), `expires`, Customterへ Cascade |
| `EmailVerification` / email_verifications | 新規登録メール認証 | `token`(uniq), `email`, `expiresAt`(24h), `consumedAt` |
| `CustomerAddress` / customer_addresses | 住所帳（返送先） | 姓名/ローマ字/住所などPII列=`*Encrypted`, `isDefault`, Customterへ Cascade |
| `Application` / applications | 申込 | `applicationNo`(uniq, APP-…), `region`(PSA_JP/PSA_US), `source`(CUSTOMER/STORE), 返送先住所/電話（暗号化）, 料金内訳, `status` |
| `Card` / cards | **カード（最重要）** | `cardNo`(uniq, CARD-…), `tcgTitle`/`releaseYear`/`cardNumber`/`cardName`/`rarity`/`language`/`declaredValue`/`quantity`, PSA各種ID/grade, 画像S3キー, `status`(CardStatus 17), 料金 |
| `CardStatusHistory` / card_status_histories | ステータス履歴 | `status`, `changedBy`(userId or customerId), Cardへ Cascade |
| `PsaSubmissionGroup` / psa_submission_groups | PSA提出グループ | `groupNo`(uniq, PSG-…), `psaSubmissionId`/`psaOrderId`, `status` |
| `Payment` / payments | 決済 | `stripePaymentIntentId`(uniq), `amount`(円), `status`(PaymentStatus) |
| `Upcharge` / upcharges | 追加請求 | `psaDeclaredValue`/`psaFinalValue`/`upchargeAmount`, `status`(UpchargeStatus) |
| `ServicePrice` / service_prices | サービス料金 | `@@unique([serviceLevel, region])`, `region`(PSA_JP/PSA_US), `pricePerCard`(=顧客請求額), `agencyFee`(当社入力時のみ加算), `maxDeclaredValue`(上限/null=無制限), `isActive` |
| `ShippingRule` / shipping_rules | 送料 | `returnMethod`, `fee`, `minAmount`/`maxAmount`(帯), `sortOrder` |
| `InsuranceRule` / insurance_rules | 保険料 | `minValue`/`maxValue`(帯), `fee` または `feeRate`(%) |
| `Agreement` / agreements | 電子同意書 | `applicationId`(uniq), `agreedAt`, `ipAddress`/`userAgent`, `agreementText`, `version` |
| `Notification` / notifications | お知らせ/通知 | `customerId`(null=全体), `type`, `title`/`body`, `isPublished`, `showOnMypage`, `isRead` |
| `OperationLog` / operation_logs | 操作ログ | `userId`/`customerId`, `action`, `targetType`/`targetId`, `before`/`after`(Json), index×3 |
| `SavedPaymentMethod` / saved_payment_methods | 保存カード | `stripePaymentMethodId`(uniq), `brand`/`last4`, `expMonth`/`expYear`, `isDefault` |

---

## リレーション概要

```
User ──< OperationLog
Customer ──< CustomerSession
Customer ──< Application ──< Card ──< CardStatusHistory
                  │            └──< Upcharge
                  ├──< Payment
                  └──1 Agreement
PsaSubmissionGroup ──< Card        （提出グループは複数顧客のカードを束ねる）
Customer ──< Payment / Upcharge / Agreement / Notification / SavedPaymentMethod
ServicePrice / ShippingRule / InsuranceRule … 料金マスタ（独立）
```

- `Card` は `Customer` と `Application` の両方に属する（`customerId` + `applicationId`）。
- `PsaSubmissionGroup` は **複数顧客・複数申込のカードを1回の提出にまとめる**ためのグルーピング。
- `CustomerSession` / `CardStatusHistory` は親削除時 `onDelete: Cascade`。

---

## 採番ルール（`lib/number-generator.ts`）
| 種別 | 形式 | 例 |
|------|------|----|
| 申込番号 | `APP-YYYYMMDD-####` | APP-20260618-0001 |
| カード番号 | `CARD-YYYYMMDD-####` | CARD-20260618-0001 |
| PSA提出グループ | `PSG-YYYYMMDD-###` | PSG-20260618-001 |

その日の同prefix件数+1で連番（日次リセット）。

---

## カードステータス（CardStatus 17段階）
```
DRAFT → SUBMITTED_BY_CUSTOMER → RECEIVED_BY_STORE → INSPECTION_PENDING → INSPECTED
→ READY_FOR_PSA → SUBMITTED_TO_PSA → PSA_RECEIVED → GRADING → GRADE_AVAILABLE
→ RETURNED_TO_STORE → READY_FOR_CUSTOMER_RETURN → RETURNED_TO_CUSTOMER
Upcharge分岐: UPCHARGE_UNPAID → UPCHARGE_PAID
異常系: PROBLEM / CANCELLED（任意タイミング）
```

## その他のEnum
- `UserRole`: ADMIN / STAFF / ACCOUNTING(未使用) / CUSTOMER
- `ApplicationStatus`: DRAFT / SUBMITTED / IN_PROGRESS / COMPLETED / CANCELLED
- `ServiceLevel`: REGULAR / EXPRESS / SUPER_EXPRESS / WALK_THROUGH / PREMIUM_1 / PREMIUM_2 / PREMIUM_3 / PREMIUM_5 / PREMIUM_10（`VALUE`は旧プラン・未使用で残置）
- `ReturnMethod`: STORE_PICKUP / SHIPPING
- `ServiceRegion`: PSA_JP / PSA_US（鑑定提出先。料金体系が地域別）
- `ApplicationSource`: CUSTOMER（顧客入力=手数料なし）/ STORE（当社入力=手数料あり）
- `CardLanguage`: JAPANESE / ENGLISH / KOREAN / CHINESE / OTHER
- `PaymentStatus`: PENDING / SUCCEEDED / FAILED / REFUNDED / PARTIALLY_REFUNDED
- `UpchargeStatus`: PENDING / PAID / FAILED / WAIVED
- `NotificationType`: EMAIL / SYSTEM

---

## 暗号化フィールド（AES-256-GCM, [SECURITY.md] 参照）
`customers` の以下を暗号化保存:
`nameEncrypted` / `nameKanaEncrypted` / `phoneEncrypted` / `prefectureEncrypted` / `addressEncrypted` / `address2Encrypted`
（`email`・`postalCode` は検索性のため平文）

`applications` の返送先情報:
`shippingAddressEncrypted` / `shippingPhoneEncrypted`

---

## ER図（テキスト）

```
┌─────────────┐         ┌──────────────────┐         ┌──────────────────────┐
│   users     │         │   customers      │         │  customer_sessions   │
│ id (PK)     │         │ id (PK)          │────1:N─▶│ customerId (FK)      │
│ email/role  │         │ *Encrypted (PII) │         │ sessionToken/expires │
│ passwordHash│         │ email/stripeCusId│         └──────────────────────┘
└──────┬──────┘         └────────┬─────────┘
       │ op logs                 │ 1:N
       ▼                         ▼
┌─────────────────┐     ┌────────────────────┐
│ operation_logs  │     │   applications     │
│ user/customerId │     │ applicationNo/料金 │
│ before/after JSON│    │ status             │
└─────────────────┘     └─────────┬──────────┘
                ┌─────────────┬────┴───────┐
                ▼             ▼            ▼
          ┌──────────┐  ┌─────────┐  ┌──────────────┐
          │  cards   │  │payments │  │  agreements  │
          │ cardNo   │  │ stripePI│  │ ip/ua/version│
          │ psa*/grade│ └─────────┘  └──────────────┘
          │ status   │
          └────┬─────┘
        ┌──────┴───────────┐
        ▼                  ▼
┌──────────────────┐  ┌─────────────────────────┐
│card_status_histories│ psa_submission_groups   │
└──────────────────┘  └─────────────────────────┘
        │
        ▼
┌──────────────┐   料金マスタ: service_prices / shipping_rules / insurance_rules
│  upcharges   │   その他: notifications / saved_payment_methods
└──────────────┘
```
