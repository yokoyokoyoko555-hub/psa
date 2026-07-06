"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteApplication } from "@/actions/application";

export interface AppRow {
  id: string;
  applicationNo: string;
  cardCount: number;
  serviceLevel: string; // 表示用ラベル or "-"
  region: string; // 表示用ラベル（PSA 日本／PSA US）
  itemType: string | null; // PSA_USのみ表示用ラベル。PSA_JPはnull
  createdAt: string; // ISO
  status: string;
  source: string; // CUSTOMER | STORE
  isDraft: boolean;
}

function fmt(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function SourceBadge({ source }: { source: string }) {
  const isStore = source === "STORE";
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${
        isStore ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"
      }`}
    >
      {isStore ? "代理入力" : "自己入力"}
    </span>
  );
}

export default function ApplicationCenter({ apps }: { apps: AppRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<AppRow[]>(apps);
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [busy, setBusy] = useState(false);

  const submitted = rows.filter((a) => !a.isDraft);
  const drafts = rows
    .filter((a) => a.isDraft)
    .sort((a, b) =>
      order === "asc"
        ? a.createdAt.localeCompare(b.createdAt)
        : b.createdAt.localeCompare(a.createdAt)
    );

  async function handleDelete(id: string) {
    if (!confirm("この下書き申込を削除しますか？")) return;
    setBusy(true);
    const res = await deleteApplication(id);
    setBusy(false);
    if (res.success) {
      setRows((prev) => prev.filter((r) => r.id !== id));
    } else {
      alert(res.error ?? "削除に失敗しました");
    }
  }

  return (
    <div className="space-y-10">
      {/* 提出済み */}
      <section>
        <h2 className="text-lg font-bold text-gray-900">提出済み</h2>
        <p className="text-sm text-gray-500 mb-3">最近完了したお申込み</p>
        {submitted.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400 text-sm">
            現在お申込みはございません
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {submitted.map((a) => (
              <Link
                key={a.id}
                href={`/mypage/applications/${a.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-gray-50"
              >
                <div>
                  <span className="font-mono text-xs text-gray-400">{a.applicationNo}</span>
                  <p className="font-medium text-gray-900 flex items-center gap-2">
                    {a.cardCount}枚 / {a.serviceLevel}
                    <SourceBadge source={a.source} />
                  </p>
                  <p className="text-xs text-gray-400">
                    {a.region}
                    {a.itemType ? ` / ${a.itemType}` : ""}
                  </p>
                </div>
                <span className="text-sm text-gray-500">{fmt(a.createdAt)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* 作業中 */}
      <section>
        <div className="flex items-end justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              作業中 <span className="text-sm text-gray-400">{drafts.length}</span>
            </h2>
            <p className="text-sm text-gray-500">未完了の申込</p>
          </div>
          <select
            value={order}
            onChange={(e) => setOrder(e.target.value as "asc" | "desc")}
            className="border border-gray-300 rounded-full px-4 py-1.5 text-sm text-gray-700"
          >
            <option value="asc">作成日：古い順</option>
            <option value="desc">作成日：新しい順</option>
          </select>
        </div>

        {drafts.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400 text-sm">
            作業中の申込はありません
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">申込</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">種別</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">提出先</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">サービスレベル</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">作成日</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {drafts.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 font-medium text-gray-900">
                      {a.source === "STORE" && a.cardCount === 0 ? "明細入力待ち" : `${a.cardCount} 枚`}
                    </td>
                    <td className="px-4 py-4"><SourceBadge source={a.source} /></td>
                    <td className="px-4 py-4 text-gray-700">
                      {a.region}
                      {a.itemType ? ` / ${a.itemType}` : ""}
                    </td>
                    <td className="px-4 py-4 text-gray-700">{a.serviceLevel}</td>
                    <td className="px-4 py-4 text-gray-700">{fmt(a.createdAt)}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {a.source === "STORE" ? (
                          <button
                            onClick={() => router.push(`/mypage/submission-booking/${a.id}`)}
                            className="border border-gray-300 rounded-full px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            予約・確認
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => handleDelete(a.id)}
                              disabled={busy}
                              className="w-9 h-9 rounded-full border border-gray-200 text-red-500 hover:bg-red-50 flex items-center justify-center"
                              title="削除"
                            >
                              🗑
                            </button>
                            <button
                              onClick={() => router.push(`/apply?draft=${a.id}`)}
                              className="border border-gray-300 rounded-full px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              続行
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
