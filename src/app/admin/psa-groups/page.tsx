export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { format } from "date-fns";
import Link from "next/link";
import CreateGroupForm from "./CreateGroupForm";
import SubmitGroupForm from "./SubmitGroupForm";
import AdvanceGroupStatusForm from "./AdvanceGroupStatusForm";
import ReturnStatusButtons from "./ReturnStatusButtons";
import type { ServiceRegion } from "@prisma/client";

const REGION_LABELS: Record<ServiceRegion, string> = {
  PSA_JP: "PSA 日本",
  PSA_US: "PSA US",
};

const ITEM_TYPE_LABELS: Record<string, string> = {
  TRADING_CARD: "トレーディングカード",
  UNOPENED_PACK: "未開封パック",
  COMIC_MAGAZINE: "コミック・マガジン",
};

// PREPARING/SUBMITTEDは固定値、それ以外は管理画面「PSA進捗ステータス」で登録した自由記述名（すでに日本語）。ADR-0021/0034
const GROUP_STATUS_LABELS: Record<string, string> = {
  PREPARING: "提出準備中",
  SUBMITTED: "発送完了",
};

export default async function PsaGroupsPage() {
  const [groups, ungrouped, progressStatuses, customServicePrices] = await Promise.all([
    prisma.psaSubmissionGroup.findMany({
      include: {
        applications: {
          include: {
            customer: { select: { nameEncrypted: true } },
            _count: { select: { cards: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    // グループ未割当かつ支払い済み（SUCCEEDED な決済あり）の申込
    prisma.application.findMany({
      where: {
        psaSubmissionGroupId: null,
        status: { not: "CANCELLED" },
        payments: { some: { status: "SUCCEEDED" } },
      },
      include: {
        customer: { select: { nameEncrypted: true } },
        _count: { select: { cards: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.psaProgressStatus.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.customServicePrice.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">PSA提出グループ管理</h1>
      <p className="text-sm text-gray-500 mb-6">
        複数の申込を1つのPSA提出グループにまとめ、提出先・アイテム種別・サービスレベル・申込番号(Sub#)を紐づけます。
      </p>

      {/* Ungrouped applications */}
      {ungrouped.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 mb-6">
          <h2 className="font-bold text-yellow-900 mb-3">グループ未割当の申込（{ungrouped.length}件）</h2>
          <CreateGroupForm
            applications={ungrouped.map((a) => ({
              id: a.id,
              label: `${a.applicationNo}（${decrypt(a.customer.nameEncrypted)} / ${a._count.cards}枚）`,
            }))}
          />
        </div>
      )}

      {/* Groups */}
      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.id} className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="font-mono text-sm text-gray-400">{group.groupNo}</p>
                <p className="font-bold text-gray-900">{group.applications.length}申込</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                group.status === "RETURNED" ? "bg-green-100 text-green-700" :
                group.status === "SUBMITTED" ? "bg-purple-100 text-purple-700" :
                "bg-yellow-100 text-yellow-700"
              }`}>
                {GROUP_STATUS_LABELS[group.status] ?? group.status}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm mb-4">
              <div><p className="text-gray-500">提出先</p><p>{group.region ? REGION_LABELS[group.region] : "—"}</p></div>
              <div><p className="text-gray-500">アイテム種別</p><p>{group.itemType ? ITEM_TYPE_LABELS[group.itemType] : "—"}</p></div>
              <div><p className="text-gray-500">サービスレベル</p><p>{group.customServiceLevelName ?? "—"}</p></div>
              <div><p className="text-gray-500">申込番号（Sub#）</p><p className="font-mono">{group.psaSubmissionId ?? "—"}</p></div>
              <div><p className="text-gray-500">提出日</p><p>{group.submittedAt ? format(new Date(group.submittedAt), "yyyy/MM/dd") : "—"}</p></div>
            </div>

            {/* 所属申込 */}
            <div className="mb-4 space-y-1">
              {group.applications.map((a) => (
                <div key={a.id} className="flex items-center justify-between text-sm bg-gray-50 rounded px-3 py-1.5">
                  <Link href={`/admin/applications/${a.id}`} className="font-mono text-brand-600 hover:underline">
                    {a.applicationNo}
                  </Link>
                  <span className="text-gray-600">{decrypt(a.customer.nameEncrypted)} / {a._count.cards}枚</span>
                </div>
              ))}
            </div>

            {group.status === "PREPARING" && (
              <SubmitGroupForm groupId={group.id} customServicePrices={customServicePrices} />
            )}
            {group.status !== "PREPARING" && (
              <div className="space-y-3">
                <AdvanceGroupStatusForm
                  groupId={group.id}
                  currentStatus={group.status}
                  statusOptions={progressStatuses.map((s) => ({ id: s.id, name: s.name, sortOrder: s.sortOrder }))}
                />
                <ReturnStatusButtons
                  groupId={group.id}
                  returnReady={Boolean(group.returnReadyAt)}
                  returned={Boolean(group.returnedAt)}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
