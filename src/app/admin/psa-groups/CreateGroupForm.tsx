"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPsaSubmissionGroup } from "@/actions/admin";

export type CardBundleOption = { key: string; label: string; cardIds: string[] };

/**
 * 「申込×サービスレベル」の束を選んでPSA提出グループを作成する。同じ申込でもサービスレベルが違えば
 * 別の束として表示され、別グループへ割り当てられる。提出先・アイテム種別・サービスレベルが揃わない
 * 組み合わせを選ぶとサーバー側でエラーになる。ADR-0076
 */
export default function CreateGroupForm({ bundles }: { bundles: CardBundleOption[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");

  function toggle(key: string) {
    setSelected((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
  }

  async function handleCreate() {
    if (selected.length === 0) return;
    setLoading(true);
    setError("");
    const cardIds = bundles.filter((b) => selected.includes(b.key)).flatMap((b) => b.cardIds);
    const result = await createPsaSubmissionGroup(cardIds);
    setLoading(false);
    if (result.success) {
      setSelected([]);
      router.refresh();
    } else {
      setError(result.error ?? "作成に失敗しました");
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {bundles.map((b) => (
          <label
            key={b.key}
            className={`flex items-center gap-2 rounded-lg border p-2 text-sm cursor-pointer transition ${
              selected.includes(b.key) ? "border-brand-500 bg-brand-50" : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <input type="checkbox" checked={selected.includes(b.key)} onChange={() => toggle(b.key)} />
            <span>{b.label}</span>
          </label>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        onClick={handleCreate}
        disabled={loading || selected.length === 0}
        className="bg-yellow-600 text-white font-bold px-6 py-2 rounded-lg hover:bg-yellow-700 disabled:opacity-50 transition text-sm"
      >
        {loading ? "作成中..." : `選択した${selected.length}件で提出グループを作成`}
      </button>
    </div>
  );
}
