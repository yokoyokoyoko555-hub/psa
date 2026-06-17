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

  // Service prices
  const servicePrices = [
    { serviceLevel: "VALUE" as const, pricePerCard: 2000, agencyFee: 500 },
    { serviceLevel: "REGULAR" as const, pricePerCard: 3500, agencyFee: 800 },
    { serviceLevel: "EXPRESS" as const, pricePerCard: 8000, agencyFee: 1500 },
    { serviceLevel: "SUPER_EXPRESS" as const, pricePerCard: 25000, agencyFee: 3000 },
  ];

  for (const sp of servicePrices) {
    await prisma.servicePrice.upsert({
      where: { serviceLevel: sp.serviceLevel },
      update: { pricePerCard: sp.pricePerCard, agencyFee: sp.agencyFee },
      create: sp,
    });
  }

  // Shipping rules
  await prisma.shippingRule.deleteMany();
  await prisma.shippingRule.createMany({
    data: [
      { returnMethod: "STORE_PICKUP", name: "店頭受取", fee: 0, minAmount: 0, sortOrder: 0 },
      { returnMethod: "SHIPPING", name: "配送（〜50,000円）", fee: 880, minAmount: 0, maxAmount: 50000, sortOrder: 0 },
      { returnMethod: "SHIPPING", name: "配送（50,001〜100,000円）", fee: 1320, minAmount: 50001, maxAmount: 100000, sortOrder: 1 },
      { returnMethod: "SHIPPING", name: "配送（100,001円〜）", fee: 1760, minAmount: 100001, sortOrder: 2 },
    ],
  });

  // Insurance rules
  await prisma.insuranceRule.deleteMany();
  await prisma.insuranceRule.createMany({
    data: [
      { minValue: 0, maxValue: 50000, fee: 0, sortOrder: 0 },
      { minValue: 50001, maxValue: 100000, fee: 500, sortOrder: 1 },
      { minValue: 100001, maxValue: 300000, fee: 1000, sortOrder: 2 },
      { minValue: 300001, maxValue: 500000, fee: 2000, sortOrder: 3 },
      { minValue: 500001, fee: 0, feeRate: 0.5, sortOrder: 4 },
    ],
  });

  // Test customer
  const customerPassword = await bcrypt.hash("Test1234!", 12);
  await prisma.customer.upsert({
    where: { email: "test@example.com" },
    update: {},
    create: {
      nameEncrypted: encrypt("テスト 太郎"),
      nameKanaEncrypted: encrypt("テスト タロウ"),
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
