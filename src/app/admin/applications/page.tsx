export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { format } from "date-fns";
import Link from "next/link";
import { formatMoneyIn } from "@/lib/currency";
import { ITEM_TYPE_LABELS, resolveServiceLevel, computeListDisplayStatus } from "@/lib/application-status";

const STATUS_BADGE_CLS: Record<string, string> = {
  申込完了: "bg-blue-50 text-blue-700",
  入力完了: "bg-indigo-50 text-indigo-700",
  支払完了: "bg-cyan-50 text-cyan-700",
  受取完了: "bg-amber-50 text-amber-700",
  発送完了: "bg-purple-50 text-purple-700",
  返送準備中: "bg-teal-50 text-teal-700",
  返送完了: "bg-green-50 text-green-700",
  店頭受取可能: "bg-teal-50 text-teal-700",
  店頭受取完了: "bg-green-50 text-green-700",
  キャンセル: "bg-gray-100 text-gray-500",
};

// 種別（自己入力/代理入力）は申込番号の接頭辞（APP-/DAI-）で判別できるため列としては持たない
const REGION_SHORT_LABELS: Record<string, string> = { PSA_JP: "日本", PSA_US: "US" };

// カードごとに異なるサービスレベルが混在する申込は「A / B / C」のように連結されて長くなるため、
// 一覧では先頭のみ＋「他」に圧縮する（並び替えは元の値のまま行う）。詳細は申込詳細ページで確認できる。
function compactServiceLevel(label: string): string {
  const parts = label.split(" / ");
  return parts.length > 1 ? `${parts[0]} 他` : label;
}

const SORTABLE_COLUMNS = ["region", "itemType", "serviceLevel", "status"] as const;
type SortColumn = (typeof SORTABLE_COLUMNS)[number];

export default async function AdminApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; sort?: string; dir?: string }>;
}) {
  const sp = await searchParams;
  const page = sp.page ? parseInt(sp.page) : 1;
  const limit = 50;
  const sortCol = SORTABLE_COLUMNS.includes(sp.sort as SortColumn) ? (sp.sort as SortColumn) : null;
  const sortDir = sp.dir === "desc" ? "desc" : "asc";

  // 自己入力(CUSTOMER)・代理入力(STORE)の両方を表示する。代理入力は先払い・明細確定が完了する
  // （status非DRAFT）まではここに出さず、「代理申込」画面（要対応）で扱う。下書き(DRAFT)は表示しない。ADR-0038
  const where = {
    status: sp.status
      ? (sp.status as "SUBMITTED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED")
      : { not: "DRAFT" as const },
  };

  const [applicationsRaw, total] = await Promise.all([
    prisma.application.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        customer: { select: { nameEncrypted: true, email: true } },
        _count: { select: { cards: true } },
        payments: { select: { status: true } },
        psaSubmissionGroup: { select: { status: true, submittedAt: true, returnReadyAt: true, returnedAt: true } },
        groupMemberships: {
          include: { psaSubmissionGroup: { select: { status: true, submittedAt: true, returnReadyAt: true, returnedAt: true } } },
        },
        submissionBooking: { select: { status: true, method: true, scheduledAt: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.application.count({ where }),
  ]);

  // 表示用の値を先に算出してからソートする（提出先・アイテム種別・サービスレベル・ステータスは
  // ラベル変換や複数フィールドの組み合わせで決まるため、DBのorderByだけでは表現できない）。ADR-0036
  const applications = applicationsRaw
    .map((app) => ({
      app,
      regionLabel: REGION_SHORT_LABELS[app.region] ?? app.region,
      itemTypeLabel: app.region === "PSA_US" ? (ITEM_TYPE_LABELS[app.itemType] ?? app.itemType) : "-",
      serviceLevelLabel: resolveServiceLevel(app),
      statusLabel: (() => {
        const raw = app.status === "CANCELLED" ? "キャンセル" : computeListDisplayStatus(app);
        return raw === "MULTIPLE" ? "複数グループ" : raw;
      })(),
    }))
    .sort((a, b) => {
      if (!sortCol) return 0;
      const key = sortCol === "region" ? "regionLabel" : sortCol === "itemType" ? "itemTypeLabel" : sortCol === "serviceLevel" ? "serviceLevelLabel" : "statusLabel";
      const cmp = a[key].localeCompare(b[key], "ja");
      return sortDir === "asc" ? cmp : -cmp;
    });

  function sortLink(col: SortColumn, label: string) {
    const nextDir = sortCol === col && sortDir === "asc" ? "desc" : "asc";
    const params = new URLSearchParams();
    if (sp.status) params.set("status", sp.status);
    params.set("sort", col);
    params.set("dir", nextDir);
    return (
      <Link href={`?${params.toString()}`} className="inline-flex items-center gap-1 hover:text-gray-900">
        {label}
        {sortCol === col && <span>{sortDir === "asc" ? "▲" : "▼"}</span>}
      </Link>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">申込管理</h1>
        <p className="text-gray-500 text-sm">全{total}件</p>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 mb-6">
        {[
          { value: "", label: "すべて" },
          { value: "SUBMITTED", label: "申込済" },
          { value: "IN_PROGRESS", label: "処理中" },
          { value: "COMPLETED", label: "完了" },
        ].map((f) => (
          <Link
            key={f.value}
            href={`?status=${f.value}`}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              (sp.status ?? "") === f.value
                ? "bg-brand-600 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-gray-600 font-medium whitespace-nowrap">申込番号</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium whitespace-nowrap">顧客</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium whitespace-nowrap">{sortLink("region", "提出先")}</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium whitespace-nowrap">{sortLink("itemType", "アイテム種別")}</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium whitespace-nowrap">{sortLink("serviceLevel", "サービスレベル")}</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium whitespace-nowrap">枚数</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium whitespace-nowrap">金額</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium whitespace-nowrap">提出予約</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium whitespace-nowrap">{sortLink("status", "ステータス")}</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium whitespace-nowrap">申込日時</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {applications.map(({ app, regionLabel, itemTypeLabel, serviceLevelLabel, statusLabel }) => {
              const booking = app.submissionBooking;
              return (
                <tr key={app.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                    <Link href={`/admin/applications/${app.id}`} className="text-brand-600 hover:underline">
                      {app.applicationNo}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/customers/${app.customerId}`} className="text-gray-900 hover:text-brand-600 hover:underline">
                      {decrypt(app.customer.nameEncrypted)}
                    </Link>
                    <p className="text-xs text-gray-400 break-all">{app.customer.email}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{regionLabel}</td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{itemTypeLabel}</td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap" title={serviceLevelLabel}>
                    {compactServiceLevel(serviceLevelLabel)}
                  </td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{app._count.cards}枚</td>
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{formatMoneyIn(app.totalAmount, "JPY")}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                    {booking?.status === "BOOKED" ? (
                      <>
                        <span className="font-medium">
                          {booking.method === "STORE_DROP_OFF" ? "店頭" : "郵送"}
                        </span>
                        <br />
                        {format(new Date(booking.scheduledAt), "MM/dd HH:mm")}
                      </>
                    ) : (
                      <span className="text-gray-400">未予約</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_BADGE_CLS[statusLabel] ?? "bg-green-50 text-green-700"}`}>
                      {statusLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {format(new Date(app.createdAt), "MM/dd HH:mm")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
