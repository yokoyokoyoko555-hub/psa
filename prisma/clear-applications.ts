import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/**
 * 申込関連データを全件削除する（検証環境のテストデータ一掃用）。
 * 顧客アカウント・管理者アカウント・料金設定などのマスタデータは削除しない。
 * 誤爆防止のため、CONFIRM_CLEAR=yes を明示的に付けない限り件数を表示するだけで削除は実行しない。
 * 実行: CONFIRM_CLEAR=yes npm run db:clear
 */
async function main() {
  const counts = {
    cardStatusHistory: await prisma.cardStatusHistory.count(),
    upcharge: await prisma.upcharge.count(),
    card: await prisma.card.count(),
    agreement: await prisma.agreement.count(),
    payment: await prisma.payment.count(),
    submissionBooking: await prisma.submissionBooking.count(),
    psaSubmissionGroupApplication: await prisma.psaSubmissionGroupApplication.count(),
    application: await prisma.application.count(),
    psaSubmissionGroup: await prisma.psaSubmissionGroup.count(),
  };

  console.log("削除対象の件数:");
  console.table(counts);

  if (process.env.CONFIRM_CLEAR !== "yes") {
    console.log("");
    console.log("⚠️  ドライランです。実際には削除していません。");
    console.log("   実行するには: CONFIRM_CLEAR=yes npm run db:clear");
    return;
  }

  console.log("");
  console.log("🗑  削除を実行します...");

  // 子テーブルから順に削除（外部キー制約のため）
  await prisma.cardStatusHistory.deleteMany({});
  await prisma.upcharge.deleteMany({});
  await prisma.card.deleteMany({});
  await prisma.agreement.deleteMany({});
  await prisma.payment.deleteMany({});
  await prisma.submissionBooking.deleteMany({});
  await prisma.psaSubmissionGroupApplication.deleteMany({});
  await prisma.application.deleteMany({});
  await prisma.psaSubmissionGroup.deleteMany({});

  console.log("✅ 申込関連データを削除しました。");
  console.log("   顧客・管理者アカウント、料金設定等のマスタデータは残しています。");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
