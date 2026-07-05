export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import StoreInputForm from "./StoreInputForm";

const REGION_LABELS: Record<string, string> = {
  PSA_JP: "PSA 日本",
  PSA_US: "PSA US",
};

export default async function StoreRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const app = await prisma.application.findUnique({
    where: { id },
    include: { customer: { select: { nameEncrypted: true, email: true } } },
  });

  if (!app || app.source !== "STORE") notFound();

  const servicePrices = await prisma.servicePrice.findMany({
    where: { region: app.region, isActive: true },
    orderBy: { pricePerCard: "asc" },
  });
  const masters = await prisma.cardNameMaster.findMany({
    select: { cardName: true },
    orderBy: { cardName: "asc" },
    take: 1000,
  });
  const masterNames = Array.from(new Set(masters.map((m) => m.cardName)));

  const alreadyDone = app.status !== "DRAFT";

  // 一時保存済みの下書き（{ serviceLevel, cards }）があれば復元用に取り出す
  const draft =
    app.draftData && typeof app.draftData === "object" && !Array.isArray(app.draftData)
      ? (app.draftData as { serviceLevel?: string; cards?: unknown[] })
      : null;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <Link href="/admin/store-requests" className="text-sm text-brand-600 hover:underline">
        ← 代理申込一覧
      </Link>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h1 className="text-xl font-bold text-gray-900 mb-4">代理申込の入力</h1>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-gray-500 text-xs">申込番号</dt>
            <dd className="font-mono">{app.applicationNo}</dd>
          </div>
          <div>
            <dt className="text-gray-500 text-xs">顧客</dt>
            <dd>{decrypt(app.customer.nameEncrypted)}（{app.customer.email}）</dd>
          </div>
          <div>
            <dt className="text-gray-500 text-xs">提出先</dt>
            <dd>{REGION_LABELS[app.region] ?? app.region}</dd>
          </div>
          <div>
            <dt className="text-gray-500 text-xs">返却方法</dt>
            <dd>{app.returnMethod === "STORE_PICKUP" ? "店頭受取" : "配送"}</dd>
          </div>
        </dl>
      </div>

      {alreadyDone ? (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl p-6 text-center">
          この代理申込は対応済みです（ステータス: {app.status}）。
        </div>
      ) : (
        <StoreInputForm
          applicationId={app.id}
          region={app.region}
          servicePrices={servicePrices}
          masterNames={masterNames}
          initialDraft={draft}
        />
      )}
    </div>
  );
}
