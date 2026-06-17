# ER図 / データベース設計

## テーブル関係図

```
┌─────────────┐         ┌──────────────────┐         ┌──────────────────────┐
│   users     │         │   customers      │         │  customer_sessions   │
│─────────────│         │──────────────────│         │──────────────────────│
│ id (PK)     │         │ id (PK)          │────────▶│ customerId (FK)      │
│ email       │         │ nameEncrypted    │         │ sessionToken         │
│ name        │         │ nameKanaEncrypted│         │ expires              │
│ passwordHash│         │ email            │         └──────────────────────┘
│ role        │         │ phoneEncrypted   │
│ 2FA設定     │         │ postalCode       │
└─────────────┘         │ addressEncrypted │
       │                │ passwordHash     │
       │ (op logs)      │ stripeCustomerId │
       ▼                └──────────────────┘
┌─────────────────┐              │
│ operation_logs  │              │ 1:N
│─────────────────│              ▼
│ id (PK)         │     ┌────────────────────┐
│ userId (FK)     │     │   applications     │
│ customerId      │     │────────────────────│
│ ipAddress       │     │ id (PK)            │
│ action          │     │ applicationNo      │
│ targetType      │     │ customerId (FK)    │
│ before (JSON)   │     │ serviceLevel       │
│ after (JSON)    │     │ returnMethod       │
│ createdAt       │     │ status             │
└─────────────────┘     │ totalAmount        │
                        │ psaFeeTotal        │
                        │ agencyFeeTotal     │
                        │ shippingFee        │
                        │ insuranceFee       │
                        │ taxAmount          │
                        └────────────────────┘
                                 │
                    ┌────────────┼────────────┐
                    │            │            │
                    ▼            ▼            ▼
             ┌──────────┐  ┌─────────┐  ┌──────────────┐
             │  cards   │  │payments │  │  agreements  │
             │──────────│  │─────────│  │──────────────│
             │ id (PK)  │  │ id (PK) │  │ id (PK)      │
             │ customerId│  │customerId│ │ customerId   │
             │ applicationId│ applicationId│ applicationId│
             │ cardNo   │  │ amount  │  │ agreedAt     │
             │ psaSubmissionGroupId│ status │ ipAddress  │
             │ psaSubId │  │ stripe  │  │ agreementText│
             │ psaOrderId│ │ PayIntent│  │ version      │
             │ psaCertNo│  └─────────┘  └──────────────┘
             │ psaGrade │
             │ tcgTitle │
             │ cardName │
             │ language │
             │ declaredValue│
             │ status   │
             │ imageKeys│
             └──────────┘
                  │
         ┌────────┴────────┐
         │                 │
         ▼                 ▼
┌─────────────────┐  ┌─────────────────────────┐
│card_status_     │  │  psa_submission_groups  │
│histories        │  │─────────────────────────│
│─────────────────│  │ id (PK)                 │
│ id (PK)         │  │ groupNo                 │
│ cardId (FK)     │  │ psaSubmissionId         │
│ status          │  │ psaOrderId              │
│ note            │  │ submittedAt             │
│ changedBy       │  │ status                  │
│ changedAt       │  └─────────────────────────┘
└─────────────────┘

┌──────────────────┐
│    upcharges     │
│──────────────────│
│ id (PK)          │
│ cardId (FK)      │
│ customerId (FK)  │
│ reason           │
│ psaDeclaredValue │
│ psaFinalValue    │
│ upchargeAmount   │
│ status           │
│ stripePaymentIntentId│
└──────────────────┘

┌──────────────────┐  ┌─────────────────┐  ┌──────────────────────┐
│  service_prices  │  │  shipping_rules │  │  insurance_rules     │
│──────────────────│  │─────────────────│  │──────────────────────│
│ serviceLevel(PK) │  │ returnMethod    │  │ minValue             │
│ pricePerCard     │  │ name            │  │ maxValue             │
│ agencyFee        │  │ fee             │  │ fee                  │
│ isActive         │  │ minAmount       │  │ feeRate              │
└──────────────────┘  │ maxAmount       │  │ isActive             │
                      └─────────────────┘  └──────────────────────┘

┌──────────────────────┐  ┌─────────────────────┐
│  notifications       │  │ saved_payment_       │
│──────────────────────│  │ methods              │
│ id (PK)              │  │─────────────────────│
│ customerId (FK)      │  │ customerId (FK)      │
│ type                 │  │ stripePaymentMethodId│
│ title                │  │ brand                │
│ body                 │  │ last4                │
│ isRead               │  │ expMonth/expYear     │
└──────────────────────┘  │ isDefault            │
                          └─────────────────────┘
```

## 主要テーブル説明

### cards（カード）- 最重要テーブル
- カード1枚を1レコードで管理
- `cardNo`: 自社管理番号（CARD-YYYYMMDD-XXXX）
- `psaSubmissionGroupId`: 複数顧客のカードをまとめた提出グループ
- `psaSubmissionId/OrderId`: PSAへ提出時に入力
- `psaCertNo/Grade`: PSA鑑定結果
- `status`: 17段階のステータス管理

### psa_submission_groups（PSA提出グループ）
- 複数顧客・複数申込のカードを1回の提出にまとめる
- `groupNo`: PSG-YYYYMMDD-XXX 形式

### agreements（電子同意書）
- 申込時の同意内容をスナップショット保存
- IPアドレス・User-Agentも保存（法的証拠）

### operation_logs（操作ログ）
- 全操作を記録
- before/afterをJSONで保存（変更履歴）

## 暗号化フィールド

AES-256-GCM暗号化で保存する個人情報:
- `customers.nameEncrypted` - 氏名
- `customers.nameKanaEncrypted` - フリガナ
- `customers.phoneEncrypted` - 電話番号
- `customers.prefectureEncrypted` - 都道府県
- `customers.addressEncrypted` - 住所
- `customers.address2Encrypted` - 建物名等
