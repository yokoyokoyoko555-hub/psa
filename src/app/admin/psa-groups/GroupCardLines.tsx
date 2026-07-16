"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveGroupCardOrder } from "@/actions/admin";
import CopyButton from "@/components/CopyButton";
import type { PsaGroupCardLine } from "@/actions/admin";

/**
 * PSA提出グループ内の全カードを、グループ全体を通した連番で一覧表示する。
 * 同じ顧客の同名カードが複数枚あっても1行（枚数表記）、別の顧客なら別行になる。
 * 提出準備中（PREPARING）はドラッグ&ドロップで並び替えて保存でき、現物へ貼るライン番号として使う。
 * 提出済みは`Card.groupLineNo`で固定され、並び替え不可になる。ADR-0075
 */
export default function GroupCardLines({
  groupId,
  lines,
  editable,
}: {
  groupId: string;
  lines: PsaGroupCardLine[];
  editable: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(lines);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  if (rows.length === 0) return null;

  function handleDragOver(index: number) {
    if (dragIndex === null || dragIndex === index) return;
    setRows((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(index, 0, moved);
      return next;
    });
    setDragIndex(index);
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    setMessage("");
    const result = await saveGroupCardOrder(groupId, rows.map((r) => r.cardId));
    setSaving(false);
    if (result.success) {
      setDirty(false);
      setMessage("並び順を保存しました");
      router.refresh();
    } else {
      setMessage(result.error ?? "保存に失敗しました");
    }
  }

  const text = rows
    .map((l, i) => `Line${i + 1}（${l.customerName}）${l.cardName} ${l.quantity}枚 [${l.applicationNo}]`)
    .join("\n");

  return (
    <div className="mb-4 border border-gray-100 rounded-lg p-3 bg-gray-50">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-gray-600">
          行番号一覧（{editable ? "ドラッグで並び替えできます" : "提出時に確定済み"}）
        </p>
        <div className="flex items-center gap-2">
          {editable && dirty && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="text-xs bg-brand-600 text-white font-bold px-2 py-1 rounded hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? "保存中..." : "並び順を保存"}
            </button>
          )}
          <CopyButton text={text} />
        </div>
      </div>
      {message && <p className="text-xs text-gray-500 mb-2">{message}</p>}
      <div className="space-y-1">
        {rows.map((l, i) => (
          <div
            key={l.cardId}
            draggable={editable}
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => {
              e.preventDefault();
              handleDragOver(i);
            }}
            onDragEnd={() => setDragIndex(null)}
            onDrop={(e) => e.preventDefault()}
            className={`text-xs text-gray-700 flex items-center gap-2 rounded px-1 py-0.5 transition ${
              editable ? "cursor-grab active:cursor-grabbing" : ""
            } ${dragIndex === i ? "bg-brand-100" : ""}`}
          >
            {editable && (
              <span className="text-gray-300 select-none shrink-0" title="ドラッグして並び替え">
                ⠿
              </span>
            )}
            <span className="font-mono text-gray-400 shrink-0">Line{i + 1}</span>
            <span className="shrink-0">（{l.customerName}）</span>
            <span>
              {l.cardName} {l.quantity}枚
            </span>
            <span className="text-gray-400 font-mono ml-auto">{l.applicationNo}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
