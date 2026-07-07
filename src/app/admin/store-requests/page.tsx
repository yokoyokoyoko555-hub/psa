export const dynamic = "force-dynamic";

import Link from "next/link";
import { getStoreRequests } from "@/actions/admin";
import { format } from "date-fns";

const REGION_LABELS: Record<string, string> = {
  PSA_JP: "PSA 日本",
  PSA_US: "PSA US",
};

export default async function StoreRequestsPage() {
  const requests = await getStoreRequests();

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">代理申込（要対応）</h1>
        <span className="bg-red-100 text-red-700 text-sm font-bold px-3 py-1 rounded-full">
          {requests.length}件
        </span>
      </div>

      {requests.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
          対応待ちの代理申込はありません
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">申込番号</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">顧客</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">提出先</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">代理入力数</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">総枚数</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">返却</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">依頼日</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">状態</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {requests.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.applicationNo}</td>
                  <td className="px-4 py-3">
                    <p className="text-gray-900">{r.customerName}</p>
                    <p className="text-xs text-gray-400">{r.customerEmail}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{REGION_LABELS[r.region] ?? r.region}</td>
                  <td className="px-4 py-3 text-gray-700">{r.agencyQuantity ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-700">{r.estimatedCardCount ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {r.returnMethod === "STORE_PICKUP" ? "店頭受取" : "配送"}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {format(new Date(r.createdAt), "yyyy/MM/dd HH:mm")}
                  </td>
                  <td className="px-4 py-3">
                    {r.awaitingPayment ? (
                      <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded-full text-xs font-medium">
                        未払い
                      </span>
                    ) : (
                      <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full text-xs font-medium">
                        入力待ち
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.awaitingPayment ? (
                      <Link
                        href={`/admin/applications/${r.id}`}
                        className="border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50 transition"
                      >
                        確認する
                      </Link>
                    ) : (
                      <Link
                        href={`/admin/store-requests/${r.id}`}
                        className="bg-brand-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-brand-700 transition"
                      >
                        入力する
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
