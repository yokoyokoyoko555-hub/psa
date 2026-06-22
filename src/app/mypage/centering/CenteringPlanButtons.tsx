"use client";

import { useState } from "react";
import { startCenteringSubscription, openBillingPortal } from "@/actions/subscription";

export function SubscribeButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function go() {
    setLoading(true);
    setError("");
    const res = await startCenteringSubscription();
    if (res.url) {
      window.location.href = res.url;
    } else {
      setError(res.error ?? "エラーが発生しました");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
      )}
      <button
        onClick={go}
        disabled={loading}
        className="w-full bg-brand-600 text-white font-bold py-3 rounded-lg hover:bg-brand-700 disabled:opacity-50"
      >
        {loading ? "決済ページへ移動中..." : "AIプランに加入する（¥550/月）"}
      </button>
    </div>
  );
}

export function ManageSubscriptionButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function go() {
    setLoading(true);
    setError("");
    const res = await openBillingPortal();
    if (res.url) {
      window.location.href = res.url;
    } else {
      setError(res.error ?? "エラーが発生しました");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
      )}
      <button
        onClick={go}
        disabled={loading}
        className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
      >
        {loading ? "..." : "支払い・解約を管理"}
      </button>
    </div>
  );
}
