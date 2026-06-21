"use server";

import { prisma } from "@/lib/prisma";
import { getCustomerSession } from "@/lib/customer-auth";
import { logOperation, getClientIp } from "@/lib/operation-log";
import { headers } from "next/headers";
import { z } from "zod";

/**
 * センタリングツールの利用可否。
 * - 開発用に CENTERING_DEV_UNLOCK=true なら常に許可（Stripe未設定でも動作確認可）。
 * - それ以外は有効なサブスク（ACTIVE/TRIALING かつ 期間内）を要求。
 *   ※サブスク加入フロー自体は Phase 0（docs/CENTERING_TOOL.md）で配線。
 */
export async function hasCenteringAccess(customerId: string): Promise<boolean> {
  if (process.env.CENTERING_DEV_UNLOCK?.trim() === "true") return true;

  const sub = await prisma.subscription.findFirst({
    where: {
      customerId,
      status: { in: ["ACTIVE", "TRIALING"] },
      currentPeriodEnd: { gt: new Date() },
    },
  });
  return !!sub;
}

/** ログイン中ユーザーの利用可否を返す（未ログインは false） */
export async function getCenteringAccess(): Promise<boolean> {
  const customer = await getCustomerSession();
  if (!customer) return false;
  return hasCenteringAccess(customer.id);
}

const saveSchema = z.object({
  frontLR: z.number().min(0).max(100),
  frontTB: z.number().min(0).max(100),
  backLR: z.number().min(0).max(100).optional(),
  backTB: z.number().min(0).max(100).optional(),
  estimatedGrade: z.string().max(8).optional(),
  cardId: z.string().optional(),
  note: z.string().max(500).optional(),
});

export async function saveCenteringMeasurement(
  input: z.infer<typeof saveSchema>
): Promise<{ success: boolean; id?: string; error?: string }> {
  const customer = await getCustomerSession();
  if (!customer) return { success: false, error: "ログインが必要です" };

  const allowed = await hasCenteringAccess(customer.id);
  if (!allowed) return { success: false, error: "ご利用にはプランへの加入が必要です" };

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "測定データが不正です" };

  const m = await prisma.centeringMeasurement.create({
    data: {
      customerId: customer.id,
      cardId: parsed.data.cardId ?? null,
      frontLR: parsed.data.frontLR,
      frontTB: parsed.data.frontTB,
      backLR: parsed.data.backLR ?? null,
      backTB: parsed.data.backTB ?? null,
      estimatedGrade: parsed.data.estimatedGrade ?? null,
      note: parsed.data.note ?? null,
    },
  });

  const hdrs = await headers();
  await logOperation({
    customerId: customer.id,
    ipAddress: getClientIp({ headers: hdrs } as unknown as Request),
    action: "CENTERING_MEASURE_SAVE",
    targetType: "centering_measurements",
    targetId: m.id,
  });

  return { success: true, id: m.id };
}

export async function getMyMeasurements() {
  const customer = await getCustomerSession();
  if (!customer) return [];
  return prisma.centeringMeasurement.findMany({
    where: { customerId: customer.id },
    orderBy: { createdAt: "desc" },
  });
}

export async function getMeasurement(id: string) {
  const customer = await getCustomerSession();
  if (!customer) return null;
  return prisma.centeringMeasurement.findFirst({
    where: { id, customerId: customer.id },
  });
}
