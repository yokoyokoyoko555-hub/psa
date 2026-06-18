"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { submitPsaGroup } from "@/actions/admin";

export default function SubmitGroupForm({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    await submitPsaGroup(groupId, {
      psaSubmissionId: fd.get("psaSubmissionId") as string,
      psaOrderId: fd.get("psaOrderId") as string,
      submittedAt: new Date(fd.get("submittedAt") as string),
    });
    router.refresh();
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-3 flex-wrap items-end border-t border-gray-100 pt-4">
      <div>
        <label className="block text-xs text-gray-500 mb-1">PSA Submission ID</label>
        <input
          type="text"
          name="psaSubmissionId"
          required
          placeholder="SUB-XXXXXXXX"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">PSA Order ID</label>
        <input
          type="text"
          name="psaOrderId"
          required
          placeholder="ORD-XXXXXXXX"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">提出日</label>
        <input
          type="date"
          name="submittedAt"
          required
          defaultValue={new Date().toISOString().split("T")[0]}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="bg-purple-600 text-white font-bold px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition text-sm"
      >
        {loading ? "送信中..." : "PSAへ提出済として登録"}
      </button>
    </form>
  );
}
