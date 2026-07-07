import { prisma } from "./prisma";
import type { PrismaClient } from "@prisma/client";
import { format } from "date-fns";

// $transaction内のループで呼ぶ場合、グローバルprismaは同一トランザクション内の
// 未コミットの作成分が見えず、count()が同じ値を返して採番が重複する。
// トランザクションの`tx`を渡せるよう、db引数（既定=グローバルprisma）を受け取る。
type Db = Pick<PrismaClient, "application" | "card" | "customer" | "psaSubmissionGroup">;

// 種別で接頭辞を変える: 自己入力(CUSTOMER)=APP- / 代理入力(STORE)=DAI-。接頭辞ごとに独立採番。
export async function generateApplicationNo(
  source: "CUSTOMER" | "STORE" = "CUSTOMER",
  db: Db = prisma
): Promise<string> {
  const today = format(new Date(), "yyyyMMdd");
  const head = source === "STORE" ? "DAI" : "APP";
  const prefix = `${head}-${today}-`;
  const count = await db.application.count({
    where: { applicationNo: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}

export async function generateCardNo(db: Db = prisma): Promise<string> {
  const today = format(new Date(), "yyyyMMdd");
  const prefix = `CARD-${today}-`;
  const count = await db.card.count({
    where: { cardNo: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}

export async function generateMemberNo(db: Db = prisma): Promise<string> {
  const count = await db.customer.count();
  return `B${String(count + 1).padStart(6, "0")}`;
}

export async function generateGroupNo(db: Db = prisma): Promise<string> {
  const today = format(new Date(), "yyyyMMdd");
  const prefix = `PSG-${today}-`;
  const count = await db.psaSubmissionGroup.count({
    where: { groupNo: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(3, "0")}`;
}
