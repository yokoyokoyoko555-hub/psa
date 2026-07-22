"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteApplication } from "@/actions/application";
import { formatMoneyIn } from "@/lib/currency";

export interface AppRow {
  id: string;
  applicationNo: string;
  cardCount: number;
  serviceLevel: string; // 表示用ラベル or "-"
  region: string; // 表示用ラベル（PSA 日本／PSA US）
  itemType: string | null; // PSA_USのみ表示用ラベル。PSA_JPはnull
  createdAt: string; // ISO
  status: string;
  displayStatus: string | null; // 顧客向け簡易ステータス（申込完了/受取完了/発送完了/PSA進捗ステータス名）。ADR-0034
  source: string; // CUSTOMER | STORE
  isDraft: boolean;
  /** 差額請求など未払いのPayment額（あれば）。ADR-0042 */
  pendingPaymentAmount: number | null;
  /** 未払い（PENDING/FAILED）Upcharge合計額（あれば） */
  pendingUpchargeTotal: number | null;
}

const PAGE_SIZE = 5;

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
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_BADGE_CLS[status] ?? "bg-green-50 text-green-700"}`}>
      {status}
    </span>
  );
}

function fmt(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function SourceBadge({ source }: { source: string }) {
  const isStore = source === "STORE";
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${
        isStore ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"
      }`}
    >
      {isStore ? "代理入力" : "自己入力"}
    </span>
  );
}

// 作業中は全件status="DRAFT"で差が無いため、一覧に表示している見た目上の状態（明細入力待ち／入力中）を
// 「ステータス」ソートの対象にする。
function draftStatusLabel(a: AppRow): string {
  return a.source === "STORE" && a.cardCount === 0 ? "明細入力待ち" : "入力中";
}

type SubmittedSort = "date_desc" | "date_asc" | "status";
type DraftSort = "date_asc" | "date_desc" | "status";

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 mt-3 text-sm text-gray-600">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center disabled:opacity-40 hover:border-brand-300 transition"
      >
        ‹
      </button>
      <span>
        {page} / {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center disabled:opacity-40 hover:border-brand-300 transition"
      >
        ›
      </button>
    </div>
  );
}

export default function ApplicationCenter({ apps }: { apps: AppRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<AppRow[]>(apps);
  const [busy, setBusy] = useState(false);

  const [submittedSort, setSubmittedSort] = useState<SubmittedSort>("date_desc");
  const [submittedPage, setSubmittedPage] = useState(1);
  const [draftSort, setDraftSort] = useState<DraftSort>("date_asc");
  const [draftPage, setDraftPage] = useState(1);

  // 未払い（差額請求・Upcharge）がある申込はお客様の対応が必要なため、通常の一覧から取り出して専用セクションに表示する。
  const actionNeeded = rows.filter(
    (a) => !a.isDraft && ((a.pendingPaymentAmount ?? 0) > 0 || (a.pendingUpchargeTotal ?? 0) > 0)
  );
  const actionNeededIds = new Set(actionNeeded.map((a) => a.id));

  const submitted = [...rows.filter((a) => !a.isDraft && !actionNeededIds.has(a.id))].sort((a, b) => {
    if (submittedSort === "status") {
      return (
        (a.displayStatus ?? "").localeCompare(b.displayStatus ?? "", "ja") ||
        b.createdAt.localeCompare(a.createdAt)
      );
    }
    return submittedSort === "date_asc"
      ? a.createdAt.localeCompare(b.createdAt)
      : b.createdAt.localeCompare(a.createdAt);
  });
  const submittedTotalPages = Math.max(1, Math.ceil(submitted.length / PAGE_SIZE));
  const submittedPageClamped = Math.min(submittedPage, submittedTotalPages);
  const submittedPageItems = submitted.slice(
    (submittedPageClamped - 1) * PAGE_SIZE,
    submittedPageClamped * PAGE_SIZE
  );

  // 代理入力(STORE)は先払い後もスタッフの明細確定までstatus=DRAFTのままのため、
  // 予約前に離脱すると申込一覧から二度と辿れなくなっていたバグを修正。作業中に含める。
  const drafts = [...rows.filter((a) => a.isDraft)].sort((a, b) => {
    if (draftSort === "status") {
      return draftStatusLabel(a).localeCompare(draftStatusLabel(b), "ja") || a.createdAt.localeCompare(b.createdAt);
    }
    return draftSort === "date_asc"
      ? a.createdAt.localeCompare(b.createdAt)
      : b.createdAt.localeCompare(a.createdAt);
  });
  const draftTotalPages = Math.max(1, Math.ceil(drafts.length / PAGE_SIZE));
  const draftPageClamped = Math.min(draftPage, draftTotalPages);
  const draftPageItems = drafts.slice((draftPageClamped - 1) * PAGE_SIZE, draftPageClamped * PAGE_SIZE);

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
      {/* お客様の対応が必要（未払いの差額請求・Upcharge） */}
      {actionNeeded.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-1">お客様の対応が必要です</h2>
          <p className="text-sm text-gray-500 mb-3">お支払いが完了していない申込があります</p>
          <div className="bg-white rounded-xl border border-amber-300 divide-y divide-amber-100">
            {actionNeeded.map((a) => (
              <Link
                key={a.id}
                href={`/mypage/applications/${a.id}`}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-5 py-4 hover:bg-amber-50"
              >
                <div className="min-w-0">
                  <span className="font-mono text-xs text-gray-400">{a.applicationNo}</span>
                  <p className="font-medium text-gray-900">
                    {a.cardCount}枚 / {a.serviceLevel}
                  </p>
                  <p className="text-sm font-bold text-amber-700 mt-1">
                    {(a.pendingPaymentAmount ?? 0) > 0 &&
                      `お支払いをお願いします（${formatMoneyIn(a.pendingPaymentAmount!, "JPY")}）`}
                    {(a.pendingPaymentAmount ?? 0) > 0 && (a.pendingUpchargeTotal ?? 0) > 0 && "／"}
                    {(a.pendingUpchargeTotal ?? 0) > 0 &&
                      `Upcharge（追加請求）のお支払いをお願いします（${formatMoneyIn(a.pendingUpchargeTotal!, "JPY")}）`}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold text-brand-600">お支払いへ ›</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 提出済み */}
      <section>
        <div className="flex items-end justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">提出済み</h2>
            <p className="text-sm text-gray-500">最近完了したお申込み</p>
          </div>
          {submitted.length > 0 && (
            <select
              value={submittedSort}
              onChange={(e) => {
                setSubmittedSort(e.target.value as SubmittedSort);
                setSubmittedPage(1);
              }}
              className="border border-gray-300 rounded-full px-4 py-1.5 text-sm text-gray-700"
            >
              <option value="date_desc">作成日：新しい順</option>
              <option value="date_asc">作成日：古い順</option>
              <option value="status">ステータス順</option>
            </select>
          )}
        </div>
        {submitted.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400 text-sm">
            現在お申込みはございません
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {submittedPageItems.map((a) => (
                <Link
                  key={a.id}
                  href={`/mypage/applications/${a.id}`}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 px-5 py-4 hover:bg-gray-50"
                >
                  <div className="min-w-0">
                    <span className="font-mono text-xs text-gray-400">{a.applicationNo}</span>
                    <p className="font-medium text-gray-900 flex flex-wrap items-center gap-2">
                      {a.cardCount}枚 / {a.serviceLevel}
                      <SourceBadge source={a.source} />
                      {a.displayStatus && <StatusBadge status={a.displayStatus} />}
                    </p>
                    <p className="text-xs text-gray-400">
                      {a.region}
                      {a.itemType ? ` / ${a.itemType}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm text-gray-500">
                    {fmt(a.createdAt)} {fmtTime(a.createdAt)}
                  </span>
                </Link>
              ))}
            </div>
            <Pagination page={submittedPageClamped} totalPages={submittedTotalPages} onChange={setSubmittedPage} />
          </>
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
            value={draftSort}
            onChange={(e) => {
              setDraftSort(e.target.value as DraftSort);
              setDraftPage(1);
            }}
            className="border border-gray-300 rounded-full px-4 py-1.5 text-sm text-gray-700"
          >
            <option value="date_asc">作成日：古い順</option>
            <option value="date_desc">作成日：新しい順</option>
            <option value="status">ステータス順</option>
          </select>
        </div>

        {drafts.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400 text-sm">
            作業中の申込はありません
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* 横スクロールさせず、狭い画面ではカード表示に切り替える */}
              <div className="md:hidden divide-y divide-gray-100">
                {draftPageItems.map((a) => (
                  <div key={a.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-gray-900">
                        {a.source === "STORE" && a.cardCount === 0 ? "明細入力待ち" : `${a.cardCount} 枚`}
                      </span>
                      <SourceBadge source={a.source} />
                    </div>
                    <dl className="grid grid-cols-[4.5em_1fr] gap-y-1 text-sm">
                      <dt className="text-gray-400">提出先</dt>
                      <dd className="text-gray-700">
                        {a.region}
                        {a.itemType ? ` / ${a.itemType}` : ""}
                      </dd>
                      <dt className="text-gray-400">サービス</dt>
                      <dd className="text-gray-700">{a.serviceLevel}</dd>
                      <dt className="text-gray-400">作成日</dt>
                      <dd className="text-gray-700">{fmt(a.createdAt)}</dd>
                    </dl>
                    <div className="pt-1 flex items-center gap-2">
                      {a.source === "STORE" ? (
                        <button
                          onClick={() => router.push(`/mypage/submission-booking/${a.id}`)}
                          className="flex-1 border border-gray-300 rounded-full px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          予約・確認
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => router.push(`/apply?draft=${a.id}`)}
                            className="flex-1 border border-gray-300 rounded-full px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            続行
                          </button>
                          <button
                            onClick={() => handleDelete(a.id)}
                            disabled={busy}
                            className="w-9 h-9 shrink-0 rounded-full border border-gray-200 text-red-500 hover:bg-red-50 flex items-center justify-center"
                            title="削除"
                          >
                            🗑
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <table className="hidden md:table w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium whitespace-nowrap">申込</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium whitespace-nowrap">種別</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium">提出先</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium">サービスレベル</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium whitespace-nowrap">作成日</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {draftPageItems.map((a) => (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 font-medium text-gray-900 whitespace-nowrap">
                        {a.source === "STORE" && a.cardCount === 0 ? "明細入力待ち" : `${a.cardCount} 枚`}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap"><SourceBadge source={a.source} /></td>
                      <td className="px-4 py-4 text-gray-700">
                        {a.region}
                        {a.itemType ? ` / ${a.itemType}` : ""}
                      </td>
                      <td className="px-4 py-4 text-gray-700">{a.serviceLevel}</td>
                      <td className="px-4 py-4 text-gray-700 whitespace-nowrap">{fmt(a.createdAt)}</td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
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
            <Pagination page={draftPageClamped} totalPages={draftTotalPages} onChange={setDraftPage} />
          </>
        )}
      </section>
    </div>
  );
}
