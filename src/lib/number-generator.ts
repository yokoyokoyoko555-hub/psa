import { prisma } from "./prisma";
import { format } from "date-fns";

// 種別で接頭辞を変える: 自己入力(CUSTOMER)=APP- / 代理入力(STORE)=DAI-。接頭辞ごとに独立採番。
export async function generateApplicationNo(
  source: "CUSTOMER" | "STORE" = "CUSTOMER"
): Promise<string> {
  const today = format(new Date(), "yyyyMMdd");
  const head = source === "STORE" ? "DAI" : "APP";
  const prefix = `${head}-${today}-`;
  const count = await prisma.application.count({
    where: { applicationNo: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}

export async function generateCardNo(): Promise<string> {
  const today = format(new Date(), "yyyyMMdd");
  const prefix = `CARD-${today}-`;
  const count = await prisma.card.count({
    where: { cardNo: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}

export async function generateMemberNo(): Promise<string> {
  const count = await prisma.customer.count();
  return `B${String(count + 1).padStart(6, "0")}`;
}

export async function generateGroupNo(): Promise<string> {
  const today = format(new Date(), "yyyyMMdd");
  const prefix = `PSG-${today}-`;
  const count = await prisma.psaSubmissionGroup.count({
    where: { groupNo: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(3, "0")}`;
}
