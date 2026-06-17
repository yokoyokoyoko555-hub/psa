export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { format } from "date-fns";
import Link from "next/link";
import CreateGroupForm from "./CreateGroupForm";
import SubmitGroupForm from "./SubmitGroupForm";

export default async function PsaGroupsPage() {
  const [groups, pendingCards] = await Promise.all([
    prisma.psaSubmissionGroup.findMany({
      include: { cards: { select: { id: true, cardNo: true, cardName: true, status: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.card.findMany({
      where: { status: "INSPECTED", psaSubmissionGroupId: null },
      select: { id: true, cardNo: true, cardName: true, tcgTitle: true },
    }),
  ]);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">PSA提出グループ管理</h1>

      {/* Pending cards */}
      {pendingCards.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 mb-6">
          <h2 className="font-bold text-yellow-900 mb-3">グループ未割当カード（{pendingCards.length}枚）</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
            {pendingCards.map((c) => (
              <div key={c.id} className="bg-white rounded-lg p-2 text-xs">
                <p className="font-mono text-gray-400">{c.cardNo}</p>
                <p className="font-medium">{c.cardName}</p>
              </div>
            ))}
          </div>
          <CreateGroupForm cardIds={pendingCards.map((c) => c.id)} />
        </div>
      )}

      {/* Groups */}
      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.id} className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="font-mono text-sm text-gray-400">{group.groupNo}</p>
                <p className="font-bold text-gray-900">{group.cards.length}枚</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                group.status === "RETURNED" ? "bg-green-100 text-green-700" :
                group.status === "SUBMITTED" ? "bg-purple-100 text-purple-700" :
                "bg-yellow-100 text-yellow-700"
              }`}>
                {group.status}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-4 text-sm mb-4">
              <div><p className="text-gray-500">PSA Submission ID</p><p className="font-mono">{group.psaSubmissionId ?? "—"}</p></div>
              <div><p className="text-gray-500">PSA Order ID</p><p className="font-mono">{group.psaOrderId ?? "—"}</p></div>
              <div><p className="text-gray-500">提出日</p><p>{group.submittedAt ? format(new Date(group.submittedAt), "yyyy/MM/dd") : "—"}</p></div>
            </div>

            {group.status === "PREPARING" && (
              <SubmitGroupForm groupId={group.id} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
