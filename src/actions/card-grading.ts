"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateCardNo } from "@/lib/number-generator";
import { logOperation, getClientIp } from "@/lib/operation-log";
import { z } from "zod";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

async function requireAdminOrStaff() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const user = session.user as { id: string; role: string };
  if (!["ADMIN", "STAFF"].includes(user.role)) throw new Error("Forbidden");
  return user;
}

const unitSchema = z.object({
  psaCertNo: z.string().min(1, "証明書番号を入力してください"),
  psaGrade: z.string().min(1, "グレードを入力してください"),
  frontImageKey: z.string().optional(),
  backImageKey: z.string().optional(),
});

const registerCardGradeSchema = z.object({
  cardId: z.string(),
  units: z.array(unitSchema).min(1, "1件以上入力してください").max(50),
});

/**
 * PSAグレード登録＋個体分割（ADR-0077）。
 * quantity>=1の元カード行から、スタッフが入力した個体ごとの証明書番号・グレード・画像を基に
 * quantity=1の個体Cardを実際の登録数だけ新規作成する。元の申告quantityと登録数が
 * 一致しなくてもエラーにしない（PSAからの返却枚数の相違に対応）。元行はそのまま残し、
 * 個体行は分割時点から新規のステータス履歴を持つ（元行の履歴はコピーしない）。
 */
export async function registerCardGrade(
  input: z.infer<typeof registerCardGradeSchema>
): Promise<{ success: boolean; error?: string; createdCardNos?: string[] }> {
  const user = await requireAdminOrStaff();

  const parsed = registerCardGradeSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }

  const original = await prisma.card.findUnique({ where: { id: parsed.data.cardId } });
  if (!original) {
    return { success: false, error: "カードが見つかりません" };
  }
  if (original.splitFromCardId) {
    return { success: false, error: "個体分割済みのカードは対象にできません" };
  }
  if (original.gradingSplitCompletedAt) {
    return { success: false, error: "このカードは既に個体登録済みです" };
  }

  const createdCardNos: string[] = [];

  await prisma.$transaction(async (tx) => {
    for (const unit of parsed.data.units) {
      const cardNo = await generateCardNo(tx);
      await tx.card.create({
        data: {
          customerId: original.customerId,
          applicationId: original.applicationId,
          cardNo,
          lineNo: original.lineNo,
          groupLineNo: original.groupLineNo,
          tcgTitle: original.tcgTitle,
          releaseYear: original.releaseYear,
          cardName: original.cardName,
          cardNumber: original.cardNumber,
          rarity: original.rarity,
          language: original.language,
          declaredValue: original.declaredValue,
          quantity: 1,
          customServiceLevelId: original.customServiceLevelId,
          customServiceLevelName: original.customServiceLevelName,
          // 料金は元行（グループ）側に既に計上済みのため個体行では0固定（原価集計等の二重計上を避ける）
          psaFee: 0,
          psaCost: 0,
          agencyFee: 0,
          status: "GRADE_AVAILABLE",
          psaCertNo: unit.psaCertNo,
          psaGrade: unit.psaGrade,
          psaGradedAt: new Date(),
          frontImageKey: unit.frontImageKey,
          backImageKey: unit.backImageKey,
          splitFromCardId: original.id,
          statusHistory: {
            create: {
              status: "GRADE_AVAILABLE",
              note: `個体分割により生成（元: ${original.cardNo}）`,
              changedBy: user.id,
            },
          },
          // 問屋型スキームのため所有権は常に顧客のまま。個体分割時点で初期状態を作成する。ADR-0078
          ownership: {
            create: {
              ownerCustomerId: original.customerId,
              status: "CUSTOMER_OWNED",
            },
          },
          ownershipHistory: {
            create: {
              toStatus: "CUSTOMER_OWNED",
              toCustomerId: original.customerId,
              reason: "個体分割により作成",
              sourceType: "CardSplit",
              sourceId: original.id,
              changedBy: user.id,
            },
          },
          custody: {
            create: {
              custodianType: "COMPANY",
              status: "AT_STORE",
            },
          },
        },
      });
      createdCardNos.push(cardNo);
    }

    await tx.card.update({
      where: { id: original.id },
      data: { gradingSplitCompletedAt: new Date() },
    });
  });

  const hdrs = await headers();
  await logOperation({
    userId: user.id,
    ipAddress: getClientIp({ headers: hdrs } as unknown as Request),
    action: "REGISTER_CARD_GRADE_SPLIT",
    targetType: "cards",
    targetId: original.id,
    before: { cardNo: original.cardNo, quantity: original.quantity },
    after: { createdCardNos },
  });

  revalidatePath(`/admin/applications/${original.applicationId}`);

  return { success: true, createdCardNos };
}
