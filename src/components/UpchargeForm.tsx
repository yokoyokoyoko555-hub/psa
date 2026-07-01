"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createUpcharge } from "@/actions/admin";

export default function UpchargeForm({ cardId }: { cardId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);

    try {
      await createUpcharge({
        cardId,
        reason: fd.get("reason") as string,
        psaDeclaredValue: parseInt(fd.get("psaDeclaredValue") as string),
        psaFinalValue: parseInt(fd.get("psaFinalValue") as string),
        upchargeAmount: parseInt(fd.get("upchargeAmount") as string),
      });
      setSuccess(true);
      router.refresh();
      (e.target as HTMLFormElement).reset();
    } catch {
      setError("Upchargeの登録に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-700 text-sm">
        ✓ Upchargeを登録しました。顧客へ通知し、自動請求を実行しました。
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</div>}

      <input
        type="text"
        name="reason"
        required
        placeholder="Upcharge理由（例: 評価額が高額なため）"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
      <div className="grid grid-cols-3 gap-2">
        <input type="number" name="psaDeclaredValue" required min={0} placeholder="PSA申告額" className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        <input type="number" name="psaFinalValue" required min={0} placeholder="最終評価額" className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        <input type="number" name="upchargeAmount" required min={1} placeholder="Upcharge額" className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-red-600 text-white font-bold py-2 rounded-lg hover:bg-red-700 disabled:opacity-50 transition text-sm"
      >
        {loading ? "処理中..." : "Upchargeを登録・請求"}
      </button>
    </form>
  );
}
