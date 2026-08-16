"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAdminNavItems } from "@/actions/admin-nav";
import type { AdminNavSection } from "@/lib/admin-nav-defaults";

type NavRow = { id: string; icon: string; label: string; sortOrder: number; section: AdminNavSection };

const SECTION_LABELS: Record<AdminNavSection, string> = {
  PSA: "鑑定",
  EBAY: "出品（eBay）",
};

/** 表示順はドラッグ&ドロップで決める（数値入力欄は「0」に戻って入力しづらいため廃止）。セクション（鑑定/出品）ごとに分けて並び替える。ADR-0079 */
export default function AdminNavOrderForm({ items }: { items: NavRow[] }) {
  const router = useRouter();
  const sections: AdminNavSection[] = ["PSA", "EBAY"];
  const [rowsBySection, setRowsBySection] = useState<Record<AdminNavSection, NavRow[]>>(() => {
    const grouped: Record<AdminNavSection, NavRow[]> = { PSA: [], EBAY: [] };
    for (const section of sections) {
      grouped[section] = items.filter((i) => i.section === section).sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return grouped;
  });
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [dragging, setDragging] = useState<{ section: AdminNavSection; index: number } | null>(null);

  function updateLabel(section: AdminNavSection, id: string, label: string) {
    setRowsBySection((prev) => ({
      ...prev,
      [section]: prev[section].map((r) => (r.id === id ? { ...r, label } : r)),
    }));
  }

  function handleDragOver(section: AdminNavSection, index: number, e: React.DragEvent) {
    e.preventDefault();
    if (!dragging || dragging.section !== section || dragging.index === index) return;
    setRowsBySection((prev) => {
      const next = [...prev[section]];
      const [moved] = next.splice(dragging.index, 1);
      next.splice(index, 0, moved);
      return { ...prev, [section]: next };
    });
    setDragging({ section, index });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    startTransition(async () => {
      const items = sections.flatMap((section) =>
        rowsBySection[section].map(({ id, label }, index) => ({ id, label, sortOrder: index }))
      );
      const result = await updateAdminNavItems({ items });
      if (result.success) {
        setMessage("保存しました");
        router.refresh();
      } else {
        setMessage(result.error ?? "保存に失敗しました");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <p className="text-xs text-gray-500">表示名の編集、ドラッグでの並び替え（上から順に表示）ができます。並び替えはセクション（鑑定受付／販売）内のみです。</p>
      {sections.map((section) => (
        <div key={section}>
          <p className="text-xs font-bold text-gray-600 mb-2">{SECTION_LABELS[section]}</p>
          <div className="space-y-2">
            {rowsBySection[section].map((row, index) => (
              <div
                key={row.id}
                draggable
                onDragStart={() => setDragging({ section, index })}
                onDragOver={(e) => handleDragOver(section, index, e)}
                onDragEnd={() => setDragging(null)}
                onDrop={(e) => e.preventDefault()}
                className={`flex items-center gap-3 border rounded-lg px-3 py-2 bg-white transition ${
                  dragging?.section === section && dragging.index === index ? "border-brand-400 opacity-60" : "border-gray-100"
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
                  onChange={(e) => updateLabel(section, row.id, e.target.value)}
                  maxLength={60}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
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
