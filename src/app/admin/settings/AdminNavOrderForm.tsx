"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAdminNavItems } from "@/actions/admin-nav";

type NavRow = { id: string; icon: string; label: string; sortOrder: number };

export default function AdminNavOrderForm({ items }: { items: NavRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<NavRow[]>(items);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function updateLabel(id: string, label: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, label } : r)));
  }

  function updateSortOrder(id: string, value: string) {
    const sortOrder = parseInt(value, 10);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, sortOrder: Number.isNaN(sortOrder) ? 0 : sortOrder } : r)));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    startTransition(async () => {
      const result = await updateAdminNavItems({
        items: rows.map(({ id, label, sortOrder }) => ({ id, label, sortOrder })),
      });
      if (result.success) {
        setMessage("保存しました");
        router.refresh();
      } else {
        setMessage(result.error ?? "保存に失敗しました");
      }
    });
  }

  const sorted = [...rows].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-xs text-gray-500">表示名と表示順（小さい順に上から表示）を編集できます。</p>
      <div className="space-y-2">
        {sorted.map((row) => (
          <div key={row.id} className="flex items-center gap-3 border border-gray-100 rounded-lg px-3 py-2">
            <span className="text-lg w-6 text-center shrink-0">{row.icon}</span>
            <input
              className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={row.label}
              onChange={(e) => updateLabel(row.id, e.target.value)}
              maxLength={60}
            />
            <label className="flex items-center gap-1.5 text-xs text-gray-500 shrink-0">
              表示順
              <input
                type="number"
                className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                value={row.sortOrder}
                onChange={(e) => updateSortOrder(row.id, e.target.value)}
              />
            </label>
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
