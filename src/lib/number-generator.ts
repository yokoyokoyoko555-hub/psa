import { prisma } from "./prisma";
import { format } from "date-fns";

export async function generateApplicationNo(): Promise<string> {
  const today = format(new Date(), "yyyyMMdd");
  const prefix = `APP-${today}-`;
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
