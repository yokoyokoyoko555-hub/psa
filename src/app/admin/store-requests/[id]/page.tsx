export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { ensureTradingCardCustomPrices } from "@/actions/pricing";
import { toJstDisplay } from "@/lib/jst-date";
import MarkReceivedButton from "@/components/MarkReceivedButton";
import StoreInputForm from "./StoreInputForm";

const REGION_LABELS: Record<string, string> = {
  PSA_JP: "PSA 日本",
  PSA_US: "PSA US",
};

const ITEM_TYPE_LABELS: Record<string, string> = {
  TRADING_CARD: "トレーディングカード",
  UNOPENED_PACK: "未開封パック",
  COMIC_MAGAZINE: "コミック・マガジン",
};

const SERVICE_LABELS: Record<string, string> = {
  VALUE: "バリュー",
  VALUE_BULK: "バリューバルク",
  VALUE_PLUS: "バリュープラス",
  VALUE_MAX: "バリューマックス",
  REGULAR: "レギュラー",
  EXPRESS: "エクスプレス",
  SUPER_EXPRESS: "スーパー・エクスプレス",
  WALK_THROUGH: "ウォーク・スルー",
  PREMIUM_1: "プレミアム 1",
  PREMIUM_2: "プレミアム 2",
  PREMIUM_3: "プレミアム 3",
  PREMIUM_5: "プレミアム 5",
  PREMIUM_10: "プレミアム 10",
  PACK_VALUE: "バリュー",
  PACK_ECONOMY: "エコノミー",
  PACK_EXPRESS: "エクスプレス",
  COMIC_MODERN: "モダン",
  COMIC_MODERN_PLUS: "モダンプラス",
  COMIC_VINTAGE: "ビンテージ",
  COMIC_VINTAGE_PLUS: "ビンテージプラス",
  COMIC_HIGH_VALUE: "ハイバリュー",
  COMIC_EXPRESS: "エクスプレス",
  COMIC_SUPER_EXPRESS: "スーパーエクスプレス",
  COMIC_WALK_THROUGH: "ウォークスルー",
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

  await ensureTradingCardCustomPrices(); // 旧ServicePrice→CustomServicePrice(category=TRADING_CARD)の初回移行。ADR-0026

  // 動的サービスタイア（トレカ含む全itemType共通）。ADR-0025/0026
  const customServicePrices = await prisma.customServicePrice.findMany({
    where: { region: app.region, category: app.itemType, isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  const autographPricing =
    app.region === "PSA_US" && app.itemType === "TRADING_CARD"
      ? await prisma.customServicePrice.findMany({
          where: { region: app.region, category: "AUTOGRAPH", isActive: true },
          orderBy: { sortOrder: "asc" },
        })
      : [];
  const masters = await prisma.cardNameMaster.findMany({
    select: { cardName: true },
    orderBy: { cardName: "asc" },
    take: 1000,
  });
  const masterNames = Array.from(new Set(masters.map((m) => m.cardName)));

  const alreadyDone = app.status !== "DRAFT";

  // 顧客が先払い時に申告したサービスレベル別枚数内訳（複数レベル同時申込に対応）。ADR-0024/0025
  const estimatedLevels = Array.isArray(app.estimatedServiceLevels)
    ? (app.estimatedServiceLevels as unknown as {
        serviceLevel?: string;
        customServiceLevelId?: string;
        customServiceLevelName?: string;
        quantity: number;
      }[])
    : [];

  // 一時保存済みの下書き（{ serviceLevel, customServiceLevelId, cards }）があれば復元用に取り出す
  const draft =
    app.draftData && typeof app.draftData === "object" && !Array.isArray(app.draftData)
      ? (app.draftData as { serviceLevel?: string; customServiceLevelId?: string; cards?: unknown[] })
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
          {app.region === "PSA_US" && (
            <div>
              <dt className="text-gray-500 text-xs">アイテム種別</dt>
              <dd>{ITEM_TYPE_LABELS[app.itemType] ?? app.itemType}</dd>
            </div>
          )}
          <div>
            <dt className="text-gray-500 text-xs">返却方法</dt>
            <dd>{app.returnMethod === "STORE_PICKUP" ? "店頭受取" : "配送"}</dd>
          </div>
        </dl>
        <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
          <span className="text-sm font-bold text-gray-700">受取確認</span>
          {app.receivedAt ? (
            <span className="text-xs text-gray-500">
              受取完了: {format(toJstDisplay(new Date(app.receivedAt)), "yyyy/MM/dd HH:mm")}
            </span>
          ) : (
            <MarkReceivedButton applicationId={app.id} />
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-bold text-gray-900 mb-3">代理入力種類・申込総数（お客様申告）</h2>
        <div className="flex items-center justify-between py-1.5 text-sm">
          <span className="text-gray-700">代理入力種類（同一カードは1としてカウント）</span>
          <span className="font-medium text-gray-900">{app.agencyQuantity ?? "—"} 点</span>
        </div>
        <div className="flex items-center justify-between py-1.5 border-t border-gray-100 text-sm">
          <span className="text-gray-700">申込総数（お預けいただく総数の目安）</span>
          <span className="font-medium text-gray-900">{app.estimatedCardCount ?? "—"} 枚</span>
        </div>
      </div>

      {estimatedLevels.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-bold text-gray-900 mb-3">顧客申告の枚数内訳（先払い概算時）</h2>
          <ul className="text-sm text-gray-700 divide-y divide-gray-100">
            {estimatedLevels.map((l, i) => (
              <li key={i} className="flex justify-between py-1.5">
                <span>
                  {l.serviceLevel
                    ? SERVICE_LABELS[l.serviceLevel] ?? l.serviceLevel
                    : l.customServiceLevelName ?? l.customServiceLevelId}
                </span>
                <span className="font-medium">{l.quantity}枚</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-gray-400">
            実際のカード明細・サービスレベルは下記入力で確定してください（顧客申告と異なっても構いません）。
          </p>
        </div>
      )}

      {alreadyDone ? (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl p-6 text-center">
          この代理申込は対応済みです（ステータス: {app.status}）。
        </div>
      ) : (
        <StoreInputForm
          applicationId={app.id}
          region={app.region}
          itemType={app.itemType}
          customServicePrices={customServicePrices}
          autographPricing={autographPricing}
          masterNames={masterNames}
          initialDraft={draft}
        />
      )}
    </div>
  );
}
