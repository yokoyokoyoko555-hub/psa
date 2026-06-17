"use client";

import { useState } from "react";
import { deletePaymentMethod } from "@/actions/payment";

export default function DeletePaymentMethodButton({ methodId }: { methodId: string }) {
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm("この支払い方法を削除しますか？")) return;
    setLoading(true);
    await deletePaymentMethod(methodId);
    setLoading(false);
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50"
    >
      {loading ? "削除中..." : "削除"}
    </button>
  );
}
