"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Campaign } from "@prisma/client";
import { saveCampaign, deleteCampaign } from "@/actions/campaign";

// Date → datetime-local 入力値（ローカル時刻）
function toLocalInput(d: Date | string): string {
  const dt = new Date(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

type Draft = {
  id?: string;
  name: string;
  discountType: "PERCENT" | "FIXED";
  value: string;
  region: "" | "PSA_JP" | "PSA_US"; // ""=全リージョン
  newCustomerOnly: boolean;
  startAt: string;
  endAt: string;
  isActive: boolean;
};

function emptyDraft(): Draft {
  const now = new Date();
  const later = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    name: "",
    discountType: "PERCENT",
    value: "50",
    region: "",
    newCustomerOnly: true,
    startAt: toLocalInput(now),
    endAt: toLocalInput(later),
    isActive: true,
  };
}

const REGION_LABEL: Record<string, string> = { "": "全リージョン", PSA_JP: "PSA日本", PSA_US: "PSA US" };
const inputCls = "border border-gray-300 rounded px-2 py-1 text-sm text-gray-900";

export default function CampaignForm({ campaigns }: { campaigns: Campaign[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState("");

  function edit(c: Campaign) {
    setDraft({
      id: c.id,
      name: c.name,
      discountType: c.discountType,
      value: String(c.value),
      region: (c.region ?? "") as Draft["region"],
      newCustomerOnly: c.newCustomerOnly,
      startAt: toLocalInput(c.startAt),
      endAt: toLocalInput(c.endAt),
      isActive: c.isActive,
    });
    setMessage("");
  }

  function save() {
    if (!draft) return;
    setMessage("");
    startTransition(async () => {
      const res = await saveCampaign({
        id: draft.id,
        name: draft.name,
        discountType: draft.discountType,
        value: parseInt(draft.value) || 0,
        region: draft.region === "" ? null : draft.region,
        newCustomerOnly: draft.newCustomerOnly,
        startAt: draft.startAt,
        endAt: draft.endAt,
        isActive: draft.isActive,
      });
      if (res.success) {
        setDraft(null);
        router.refresh();
      } else {
        setMessage(res.error ?? "保存に失敗しました");
      }
    });
  }

  function remove(id: string) {
    if (!confirm("このキャンペーンを削除しますか？")) return;
    startTransition(async () => {
      await deleteCampaign(id);
      router.refresh();
    });
  }

  function fmtValue(c: Campaign) {
    return c.discountType === "PERCENT" ? `${c.value}% OFF` : `${c.value} 引き`;
  }
  function fmtPeriod(c: Campaign) {
    const f = (d: Date) => new Date(d).toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" });
    return `${f(c.startAt)} 〜 ${f(c.endAt)}`;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        期間中の対象申込に自動適用されます。割引対象は「鑑定料以外（送料・保険／事務手数料／代理入力料金）」です。
      </p>

      <div className="space-y-2">
        {campaigns.length === 0 && <p className="text-sm text-gray-400">キャンペーンはありません。</p>}
        {campaigns.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-3 border border-gray-100 rounded-lg p-3 text-sm">
            <div className="min-w-0">
              <p className="font-bold text-gray-900">
                {c.name}
                {!c.isActive && <span className="ml-2 text-xs text-gray-400">(無効)</span>}
              </p>
              <p className="text-gray-500">
                {fmtValue(c)} ・ {REGION_LABEL[c.region ?? ""]} ・ {c.newCustomerOnly ? "新規限定" : "全員"} ・ {fmtPeriod(c)}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => edit(c)} className="text-brand-600 hover:underline">編集</button>
              <button onClick={() => remove(c.id)} className="text-red-500 hover:underline">削除</button>
            </div>
          </div>
        ))}
      </div>

      {draft ? (
        <div className="border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm space-y-1">
              <span className="text-gray-700">キャンペーン名</span>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={`${inputCls} w-full`} placeholder="新規申込キャンペーン" />
            </label>
            <label className="text-sm space-y-1">
              <span className="text-gray-700">対象リージョン</span>
              <select value={draft.region} onChange={(e) => setDraft({ ...draft, region: e.target.value as Draft["region"] })} className={`${inputCls} w-full`}>
                <option value="">全リージョン</option>
                <option value="PSA_JP">PSA日本</option>
                <option value="PSA_US">PSA US</option>
              </select>
            </label>
            <label className="text-sm space-y-1">
              <span className="text-gray-700">割引方式</span>
              <select value={draft.discountType} onChange={(e) => setDraft({ ...draft, discountType: e.target.value as "PERCENT" | "FIXED" })} className={`${inputCls} w-full`}>
                <option value="PERCENT">割引率（%）</option>
                <option value="FIXED">固定額</option>
              </select>
            </label>
            <label className="text-sm space-y-1">
              <span className="text-gray-700">{draft.discountType === "PERCENT" ? "割引率（% / 半額=50・無料=100）" : "割引額"}</span>
              <input type="number" min={0} value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} className={`${inputCls} w-full`} />
            </label>
            <label className="text-sm space-y-1">
              <span className="text-gray-700">開始日時</span>
              <input type="datetime-local" value={draft.startAt} onChange={(e) => setDraft({ ...draft, startAt: e.target.value })} className={`${inputCls} w-full`} />
            </label>
            <label className="text-sm space-y-1">
              <span className="text-gray-700">終了日時</span>
              <input type="datetime-local" value={draft.endAt} onChange={(e) => setDraft({ ...draft, endAt: e.target.value })} className={`${inputCls} w-full`} />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={draft.newCustomerOnly} onChange={(e) => setDraft({ ...draft, newCustomerOnly: e.target.checked })} />
              新規（初回申込）限定
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />
              有効
            </label>
          </div>
          {message && <p className="text-sm text-red-600">{message}</p>}
          <div className="flex items-center justify-end gap-3">
            <button onClick={() => setDraft(null)} className="text-sm text-gray-500 hover:text-gray-700">キャンセル</button>
            <button onClick={save} disabled={isPending} className="bg-brand-600 text-white font-bold px-6 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50 text-sm">
              {isPending ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end">
          <button onClick={() => setDraft(emptyDraft())} className="border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            ＋ キャンペーンを追加
          </button>
        </div>
      )}
    </div>
  );
}
