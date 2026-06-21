"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resetPassword } from "@/actions/customer";

const inputCls =
  "w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";

export default function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password") ?? "");
    const confirm = String(fd.get("confirm") ?? "");

    if (password !== confirm) {
      setError("パスワードが一致しません");
      return;
    }
    if (password.length < 8) {
      setError("パスワードは8文字以上で入力してください");
      return;
    }

    setLoading(true);
    const res = await resetPassword({ token, password });
    setLoading(false);

    if (res.success) {
      setDone(true);
    } else {
      setError(res.error ?? "再設定に失敗しました");
    }
  }

  if (done) {
    return (
      <div className="space-y-4">
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-4 text-sm">
          パスワードを再設定しました。新しいパスワードでログインしてください。
        </div>
        <button
          onClick={() => router.push("/login")}
          className="w-full bg-brand-600 text-white font-bold py-3 rounded-lg hover:bg-brand-700"
        >
          ログインへ
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
      )}
      <input
        type="password"
        name="password"
        required
        minLength={8}
        autoComplete="new-password"
        placeholder="新しいパスワード（8文字以上）"
        className={inputCls}
      />
      <input
        type="password"
        name="confirm"
        required
        minLength={8}
        autoComplete="new-password"
        placeholder="新しいパスワード（確認）"
        className={inputCls}
      />
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-brand-600 text-white font-bold py-3 rounded-lg hover:bg-brand-700 disabled:opacity-50"
      >
        {loading ? "設定中..." : "パスワードを再設定"}
      </button>
    </form>
  );
}
