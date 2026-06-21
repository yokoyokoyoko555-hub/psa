"use client";

import { useState } from "react";
import { changeCustomerPassword } from "@/actions/customer";

export default function ChangePasswordForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess(false);

    const form = e.currentTarget;
    const fd = new FormData(form);
    const currentPassword = String(fd.get("currentPassword") ?? "");
    const newPassword = String(fd.get("newPassword") ?? "");
    const confirmPassword = String(fd.get("confirmPassword") ?? "");

    if (newPassword !== confirmPassword) {
      setError("新しいパスワードが一致しません");
      return;
    }
    if (newPassword.length < 8) {
      setError("新しいパスワードは8文字以上で入力してください");
      return;
    }

    setLoading(true);
    const result = await changeCustomerPassword({ currentPassword, newPassword });
    setLoading(false);

    if (result.success) {
      setSuccess(true);
      form.reset();
    } else {
      setError(result.error ?? "変更に失敗しました");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">
          パスワードを変更しました。
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">現在のパスワード</label>
        <input
          type="password"
          name="currentPassword"
          required
          autoComplete="current-password"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">新しいパスワード（8文字以上）</label>
        <input
          type="password"
          name="newPassword"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">新しいパスワード（確認）</label>
        <input
          type="password"
          name="confirmPassword"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="bg-brand-600 text-white font-bold px-6 py-2.5 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition"
      >
        {loading ? "変更中..." : "パスワードを変更"}
      </button>
    </form>
  );
}
