"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { recordGrade } from "@/actions/admin";

export default function GradeForm({
  cardId,
  currentCertNo,
  currentGrade,
}: {
  cardId: string;
  currentCertNo: string | null;
  currentGrade: string | null;
}) {
  const router = useRouter();
  const [certNo, setCertNo] = useState(currentCertNo ?? "");
  const [grade, setGrade] = useState(currentGrade ?? "");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!certNo || !grade) return;
    setLoading(true);
    await recordGrade(cardId, { psaCertNo: certNo, psaGrade: grade });
    router.refresh();
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-3 items-end">
      <div className="flex-1">
        <label className="block text-xs text-gray-500 mb-1">PSA Cert No</label>
        <input
          type="text"
          value={certNo}
          onChange={(e) => setCertNo(e.target.value)}
          placeholder="12345678"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="w-24">
        <label className="block text-xs text-gray-500 mb-1">Grade</label>
        <select
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">—</option>
          {["10", "9.5", "9", "8.5", "8", "7.5", "7", "6.5", "6", "5.5", "5", "4.5", "4", "3.5", "3", "2.5", "2", "1.5", "1", "A"].map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={loading || !certNo || !grade}
        className="bg-green-600 text-white font-bold px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 transition text-sm"
      >
        {loading ? "登録中" : "登録"}
      </button>
    </form>
  );
}
