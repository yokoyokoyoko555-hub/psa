export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import CardMasterManager from "./CardMasterManager";

export const metadata = { title: "カード名称マスタ | 管理" };

export default async function CardMastersPage() {
  const masters = await prisma.cardNameMaster.findMany({
    orderBy: { cardName: "asc" },
    take: 1000,
  });

  return (
    <div className="p-8 max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">カード名称マスタ</h1>
        <p className="text-sm text-gray-500 mt-1">
          手入力で蓄積したカード名称を、代理入力（サブミッション）時に検索・サジェストで利用します。
        </p>
      </div>
      <CardMasterManager masters={masters} />
    </div>
  );
}
