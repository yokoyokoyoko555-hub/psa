"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPsaSubmissionGroup } from "@/actions/admin";

type Option = { id: string; label: string };

export default function CreateGroupForm({ applications }: { applications: Option[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleCreate() {
    if (selected.length === 0) return;
    setLoading(true);
    await createPsaSubmissionGroup(selected);
    setSelected([]);
    router.refresh();
    setLoading(false);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {applications.map((a) => (
          <label
            key={a.id}
            className={`flex items-center gap-2 rounded-lg border p-2 text-sm cursor-pointer transition ${
              selected.includes(a.id) ? "border-brand-500 bg-brand-50" : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <input type="checkbox" checked={selected.includes(a.id)} onChange={() => toggle(a.id)} />
            <span>{a.label}</span>
          </label>
        ))}
      </div>
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
