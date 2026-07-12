"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAdminNavItems } from "@/actions/admin-nav";

type NavRow = { id: string; icon: string; label: string; sortOrder: number };

/** 表示順はドラッグ&ドロップで決める（数値入力欄は「0」に戻って入力しづらいため廃止）。 */
export default function AdminNavOrderForm({ items }: { items: NavRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<NavRow[]>([...items].sort((a, b) => a.sortOrder - b.sortOrder));
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  function updateLabel(id: string, label: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, label } : r)));
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    setRows((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(index, 0, moved);
      return next;
    });
    setDragIndex(index);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    startTransition(async () => {
      const result = await updateAdminNavItems({
        items: rows.map(({ id, label }, index) => ({ id, label, sortOrder: index })),
      });
      if (result.success) {
        setMessage("保存しました");
        router.refresh();
      } else {
        setMessage(result.error ?? "保存に失敗しました");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-xs text-gray-500">表示名の編集、ドラッグでの並び替え（上から順に表示）ができます。</p>
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div
            key={row.id}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={() => setDragIndex(null)}
            onDrop={(e) => e.preventDefault()}
            className={`flex items-center gap-3 border rounded-lg px-3 py-2 bg-white transition ${
              dragIndex === index ? "border-brand-400 opacity-60" : "border-gray-100"
            }`}
          >
            <span
              className="text-gray-300 text-lg cursor-grab active:cursor-grabbing select-none shrink-0"
              title="ドラッグして並び替え"
            >
              ⠿
            </span>
            <span className="text-lg w-6 text-center shrink-0">{row.icon}</span>
            <input
              className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={row.label}
              onChange={(e) => updateLabel(row.id, e.target.value)}
              maxLength={60}
            />
          </div>
        ))}
      </div>
      {message && <p className="text-sm text-gray-600">{message}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="bg-brand-600 text-white font-bold px-5 py-2.5 rounded-lg hover:bg-brand-700 transition disabled:opacity-50"
      >
        {isPending ? "保存中..." : "保存する"}
      </button>
    </form>
  );
}
