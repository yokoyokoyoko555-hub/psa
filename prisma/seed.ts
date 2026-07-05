import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { createCipheriv, randomBytes } from "crypto";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const ENCRYPTION_KEY = Buffer.from(
  process.env.ENCRYPTION_KEY ??
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "hex"
);

function encrypt(text: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

async function main() {
  console.log("🌱 Seeding database...");

  // Admin user
  const adminPassword = await bcrypt.hash("Admin1234!", 12);
  await prisma.user.upsert({
    where: { email: "admin@turupurun.com" },
    update: {},
    create: {
      email: "admin@turupurun.com",
      name: "管理者",
      passwordHash: adminPassword,
      role: "ADMIN",
    },
  });

  const staffPassword = await bcrypt.hash("Staff1234!", 12);
  await prisma.user.upsert({
    where: { email: "staff@turupurun.com" },
    update: {},
    create: {
      email: "staff@turupurun.com",
      name: "スタッフ",
      passwordHash: staffPassword,
      role: "STAFF",
    },
  });

  // Service prices（PSA料金表。pricePerCard=顧客請求額、agencyFee=当社入力時のみ加算）
  // 地域(PSA_JP / PSA_US)ごとに保持。PSA_US は暫定で JP と同額（管理画面で調整）。
  const baseLevels = [
    { serviceLevel: "VALUE_BULK" as const, pricePerCard: 1500, maxDeclaredValue: 50000 },
    { serviceLevel: "VALUE_PLUS" as const, pricePerCard: 2500, maxDeclaredValue: 100000 },
    { serviceLevel: "VALUE_MAX" as const, pricePerCard: 4000, maxDeclaredValue: 150000 },
    { serviceLevel: "REGULAR" as const, pricePerCard: 9584, maxDeclaredValue: 250000 },
    { serviceLevel: "EXPRESS" as const, pricePerCard: 20682, maxDeclaredValue: 400000 },
    { serviceLevel: "SUPER_EXPRESS" as const, pricePerCard: 40482, maxDeclaredValue: 750000 },
    { serviceLevel: "WALK_THROUGH" as const, pricePerCard: 80982, maxDeclaredValue: 1500000 },
    { serviceLevel: "PREMIUM_1" as const, pricePerCard: 149980, maxDeclaredValue: 4000000 },
    { serviceLevel: "PREMIUM_2" as const, pricePerCard: 299980, maxDeclaredValue: 8000000 },
    { serviceLevel: "PREMIUM_3" as const, pricePerCard: 449980, maxDeclaredValue: 15000000 },
    { serviceLevel: "PREMIUM_5" as const, pricePerCard: 749980, maxDeclaredValue: 35000000 },
    { serviceLevel: "PREMIUM_10" as const, pricePerCard: 1499980, maxDeclaredValue: null },
  ];
  const regions = ["PSA_JP", "PSA_US"] as const;

  // 既存の料金は維持し、無い (レベル×地域×アイテム種別) のみ追加（管理画面の編集値を消さない）
  for (const region of regions) {
    for (const l of baseLevels) {
      await prisma.servicePrice.upsert({
        where: { serviceLevel_region_itemType: { serviceLevel: l.serviceLevel, region, itemType: "TRADING_CARD" } },
        update: {},
        create: { ...l, region, itemType: "TRADING_CARD" },
      });
    }
  }

  // 旧固定enumタイア（未開封パック・コミック/マガジン）のプレースホルダー行は撤去。
  // 未開封パック・コミック/マガジン・オートグラフは CustomServicePrice として管理画面から追加する運用に変更。ADR-0025
  await prisma.servicePrice.deleteMany({
    where: { itemType: { in: ["UNOPENED_PACK", "COMIC_MAGAZINE"] } },
  });

  // Shipping rules（itemType未指定=TRADING_CARD。新アイテム種別は当面$0フォールバックとなる）
  await prisma.shippingRule.deleteMany();
  await prisma.shippingRule.createMany({
    data: [
      { returnMethod: "STORE_PICKUP", itemType: "TRADING_CARD", name: "店頭受取", fee: 0, minAmount: 0, sortOrder: 0 },
      { returnMethod: "SHIPPING", itemType: "TRADING_CARD", name: "配送（〜50,000円）", fee: 880, minAmount: 0, maxAmount: 50000, sortOrder: 0 },
      { returnMethod: "SHIPPING", itemType: "TRADING_CARD", name: "配送（50,001〜100,000円）", fee: 1320, minAmount: 50001, maxAmount: 100000, sortOrder: 1 },
      { returnMethod: "SHIPPING", itemType: "TRADING_CARD", name: "配送（100,001円〜）", fee: 1760, minAmount: 100001, sortOrder: 2 },
    ],
  });

  // Insurance rules（PSA US用に温存。PSA日本は下記の合算マトリクスを使用。itemType未指定=TRADING_CARD）
  await prisma.insuranceRule.deleteMany();
  await prisma.insuranceRule.createMany({
    data: [
      { itemType: "TRADING_CARD", minValue: 0, maxValue: 50000, fee: 0, sortOrder: 0 },
      { itemType: "TRADING_CARD", minValue: 50001, maxValue: 100000, fee: 500, sortOrder: 1 },
      { itemType: "TRADING_CARD", minValue: 100001, maxValue: 300000, fee: 1000, sortOrder: 2 },
      { itemType: "TRADING_CARD", minValue: 300001, maxValue: 500000, fee: 2000, sortOrder: 3 },
      { itemType: "TRADING_CARD", minValue: 500001, fee: 0, feeRate: 0.5, sortOrder: 4 },
    ],
  });

  // メールテンプレート初期データ（既存は保持＝createのみ）。ADR-0018
  const mailTemplates = [
    {
      key: "application_received",
      name: "申込受付",
      subject: "【トレカビンクス】お申込みを受け付けました（{{applicationNo}}）",
      bodyHtml:
        "<p>{{name}} 様</p><p>お申込みを受け付けました。</p><p>申込番号: {{applicationNo}}<br>合計金額: {{amount}}</p><p>進捗はマイページでご確認いただけます。</p>",
    },
    {
      key: "store_input_completed",
      name: "代理入力 完了・請求のご案内",
      subject: "【トレカビンクス】カード内容が確定しました（{{applicationNo}}）",
      bodyHtml:
        "<p>{{name}} 様</p><p>お預かりしたカードの内容を確定しました。</p><p>申込番号: {{applicationNo}}<br>合計金額: {{amount}}</p><p>詳細はマイページでご確認ください。</p>",
    },
    {
      key: "grade_available",
      name: "グレード確定",
      subject: "【トレカビンクス】鑑定グレードが確定しました",
      bodyHtml: "<p>{{name}} 様</p><p>鑑定結果が確定しました。マイページでご確認ください。</p>",
    },
    {
      key: "return_completed",
      name: "返却完了",
      subject: "【トレカビンクス】カードの返却が完了しました",
      bodyHtml: "<p>{{name}} 様</p><p>カードの返却手続きが完了しました。</p>",
    },
  ];
  for (const t of mailTemplates) {
    await prisma.mailTemplate.upsert({ where: { key: t.key }, update: {}, create: t });
  }

  // 料金共通設定（事務手数料・一律）。リージョン×アイテム種別。upsertで既存編集値を保持。
  // 既存2行(id="PSA_JP"/"PSA_US")は id をそのまま where に使い、region/itemType のみバックフィル（非破壊）。ADR-0015 / ADR-0023
  for (const r of ["PSA_JP", "PSA_US"] as const) {
    await prisma.pricingSetting.upsert({
      where: { id: r },
      update: { region: r, itemType: "TRADING_CARD" },
      create: { id: r, region: r, itemType: "TRADING_CARD", handlingFee: 0, proxyFee: 0 },
    });
  }
  // 新アイテム種別分（PSA_USのみ）。新規idを採番。
  for (const itemType of ["UNOPENED_PACK", "COMIC_MAGAZINE"] as const) {
    const id = `PSA_US_${itemType}`;
    await prisma.pricingSetting.upsert({
      where: { id },
      update: {},
      create: { id, region: "PSA_US", itemType, handlingFee: 0, proxyFee: 0 },
    });
  }

  // 送料・保険 合算マトリクス（PSA日本）。申告価格合計帯 × 枚数帯。26+は基準額+加算単価×(枚数-25)。ADR-0015
  const siBands = [
    { min: 0, max: 175000, f8: 1900, f25: 2400, sur: 25 },
    { min: 175001, max: 1000000, f8: 3400, f25: 3900, sur: 25 },
    { min: 1000001, max: 2500000, f8: 4200, f25: 4700, sur: 25 },
    { min: 2500001, max: 4500000, f8: 4900, f25: 5400, sur: 25 },
    { min: 4500001, max: 10000000, f8: 6100, f25: 6600, sur: 25 },
    { min: 10000001, max: 15000000, f8: 6900, f25: 7400, sur: 50 },
    { min: 15000001, max: 20000000, f8: 8400, f25: 8900, sur: 50 },
    { min: 20000001, max: 30000000, f8: 12500, f25: 12900, sur: 50 },
    { min: 30000001, max: null as number | null, f8: 13600, f25: 14200, sur: 50 },
  ];
  await prisma.shippingInsuranceRate.deleteMany({ where: { region: "PSA_JP" } });
  await prisma.shippingInsuranceRate.createMany({
    data: siBands.flatMap((b, i) => [
      { region: "PSA_JP" as const, minValue: b.min, maxValue: b.max, qtyMin: 1, qtyMax: 8, fee: b.f8, perCardSurcharge: 0, sortOrder: i * 3 },
      { region: "PSA_JP" as const, minValue: b.min, maxValue: b.max, qtyMin: 9, qtyMax: 25, fee: b.f25, perCardSurcharge: 0, sortOrder: i * 3 + 1 },
      { region: "PSA_JP" as const, minValue: b.min, maxValue: b.max, qtyMin: 26, qtyMax: null, fee: b.f25, perCardSurcharge: b.sur, sortOrder: i * 3 + 2 },
    ]),
  });

  // Test customer
  const customerPassword = await bcrypt.hash("Test1234!", 12);
  await prisma.customer.upsert({
    where: { email: "test@example.com" },
    update: { memberNo: "B000001" },
    create: {
      memberNo: "B000001",
      nameEncrypted: encrypt("テスト 太郎"),
      nameKanaEncrypted: encrypt("Test Taro"),
      lastNameEncrypted: encrypt("テスト"),
      firstNameEncrypted: encrypt("太郎"),
      lastNameRomanEncrypted: encrypt("Test"),
      firstNameRomanEncrypted: encrypt("Taro"),
      email: "test@example.com",
      phoneEncrypted: encrypt("090-1234-5678"),
      postalCode: "1234567",
      prefectureEncrypted: encrypt("東京都"),
      addressEncrypted: encrypt("渋谷区テスト1-2-3"),
      passwordHash: customerPassword,
      stripeCustomerId: "cus_test_placeholder",
    },
  });

  console.log("✅ Seeding complete!");
  console.log("");
  console.log("テストアカウント:");
  console.log("  管理者: admin@turupurun.com / Admin1234!");
  console.log("  スタッフ: staff@turupurun.com / Staff1234!");
  console.log("  顧客: test@example.com / Test1234!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
