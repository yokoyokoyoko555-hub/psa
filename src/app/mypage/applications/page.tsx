export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCustomerSession } from "@/lib/customer-auth";
import { getMyApplications } from "@/actions/application";
import CustomerHeader from "@/components/CustomerHeader";
import ApplicationCenter, { type AppRow } from "./ApplicationCenter";

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

const REGION_LABELS: Record<string, string> = {
  PSA_JP: "PSA 日本",
  PSA_US: "PSA US",
};

const ITEM_TYPE_LABELS: Record<string, string> = {
  TRADING_CARD: "トレーディングカード",
  UNOPENED_PACK: "未開封パック",
  COMIC_MAGAZINE: "コミック・マガジン",
};

/**
 * 顧客向けの簡易ステータス（申込完了→受取完了→発送完了→PSA進捗ステータス）を算出する。
 * PSA提出グループのstatusがPREPARING/SUBMITTED以外（=管理画面で登録したPSA進捗ステータス名）
 * の場合はその名称をそのまま表示する。ADR-0034
 */
function computeDisplayStatus(app: {
  receivedAt: Date | null;
  psaSubmissionGroup: { status: string; submittedAt: Date | null } | null;
}): string {
  const group = app.psaSubmissionGroup;
  if (group && group.status !== "PREPARING" && group.status !== "SUBMITTED") {
    return group.status;
  }
  if (group && (group.status === "SUBMITTED" || group.submittedAt)) {
    return "発送完了";
  }
  if (app.receivedAt) return "受取完了";
  return "申込完了";
}

export default async function ApplicationsPage() {
  const customer = await getCustomerSession();
  if (!customer) redirect("/login");

  const applications = await getMyApplications();

  const rows: AppRow[] = applications.map((app) => {
    const draftCards =
      app.status === "DRAFT" && app.draftData
        ? ((app.draftData as { cards?: unknown[] }).cards?.length ?? 0)
        : 0;
    // サービスレベルは動的タイア（CustomServicePrice）のスナップショット名を優先し、
    // 未選択（代理入力の明細入力待ちなど）の場合のみ「未選択」とする。ADR-0026以降serviceLevelは常に"CUSTOM"のため。
    const serviceLevel =
      app.customServiceLevelName ?? SERVICE_LABELS[app.serviceLevel] ?? (app.serviceLevel === "CUSTOM" ? "未選択" : app.serviceLevel);
    return {
      id: app.id,
      applicationNo: app.applicationNo,
      cardCount: app.status === "DRAFT" ? draftCards : app.cards.length,
      serviceLevel,
      region: REGION_LABELS[app.region] ?? app.region,
      itemType: app.region === "PSA_US" ? (ITEM_TYPE_LABELS[app.itemType] ?? app.itemType) : null,
      createdAt: new Date(app.createdAt).toISOString(),
      status: app.status,
      displayStatus: app.status === "DRAFT" ? null : computeDisplayStatus(app),
      source: app.source,
      isDraft: app.status === "DRAFT",
    };
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <CustomerHeader
        title="申込一覧"
        actions={
          <Link
            href="/apply"
            className="shrink-0 bg-brand-600 text-white rounded-full px-4 py-1.5 text-sm font-bold hover:bg-brand-700 transition"
          >
            新規申込
          </Link>
        }
      />

      <main className="max-w-4xl mx-auto px-4 py-8">
        <ApplicationCenter apps={rows} />
      </main>
    </div>
  );
}
