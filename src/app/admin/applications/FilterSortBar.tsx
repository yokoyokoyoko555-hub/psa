"use client";

import { useRouter } from "next/navigation";

// STATUS_TABS（page.tsx）と同じ区分。ステータス絞り込みをプルダウン化したもの。
const STATUS_OPTIONS = [
  { value: "", label: "すべて" },
  { value: "申込完了", label: "申込完了" },
  { value: "受取完了", label: "受取完了" },
  { value: "入力完了", label: "入力完了" },
  { value: "支払完了", label: "支払完了" },
  { value: "発送完了", label: "発送完了" },
  { value: "PSA対応中", label: "PSA対応中" },
  { value: "返送準備中", label: "返送準備中" },
  { value: "店頭受取可能", label: "店頭受取可能" },
  { value: "返送完了", label: "返送完了" },
  { value: "店頭受取完了", label: "店頭受取完了" },
  { value: "キャンセル", label: "キャンセル" },
];

const SORT_OPTIONS = [
  { value: "", label: "並び替えなし" },
  { value: "region", label: "提出先" },
  { value: "itemType", label: "アイテム種別" },
  { value: "serviceLevel", label: "サービスレベル" },
  { value: "booking", label: "提出予約" },
  { value: "status", label: "ステータス" },
];

/** 申込管理のステータス絞り込み・並び替えをプルダウンで操作するコンパクトなコントロール群。GETクエリを書き換えて遷移する。 */
export default function FilterSortBar({
  status,
  q,
  sort,
  dir,
}: {
  status: string;
  q: string;
  sort: string;
  dir: string;
}) {
  const router = useRouter();

  function navigate(next: { status?: string; sort?: string; dir?: string }) {
    const nextStatus = next.status ?? status;
    const nextSort = next.sort ?? sort;
    const nextDir = next.dir ?? dir;
    const params = new URLSearchParams();
    if (nextStatus) params.set("status", nextStatus);
    if (q) params.set("q", q);
    if (nextSort) {
      params.set("sort", nextSort);
      params.set("dir", nextDir);
    }
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-6">
      <select
        value={status}
        onChange={(e) => navigate({ status: e.target.value })}
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        value={sort}
        onChange={(e) => navigate({ sort: e.target.value })}
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {sort && (
        <select
          value={dir}
          onChange={(e) => navigate({ dir: e.target.value })}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="asc">昇順</option>
          <option value="desc">降順</option>
        </select>
      )}
    </div>
  );
}
