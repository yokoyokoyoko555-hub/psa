"use client";

import { useState } from "react";
import Link from "next/link";
import { requestRegistration } from "@/actions/customer";

export default function EmailStart() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const result = await requestRegistration({
      email: fd.get("email") as string,
      hp: (fd.get("company") as string) || undefined,
    });
    setLoading(false);
    if (result.success) {
      setSent(true);
      setDevLink(result.devLink ?? null);
    } else {
      setError(result.error ?? "送信に失敗しました");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="w-full max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">新規会員登録</h1>
          <p className="text-center text-gray-500 text-sm mb-8">
            メールアドレスを入力してください。確認メールをお送りします。
          </p>

          {sent ? (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-4 text-sm">
                確認メールを送信しました。メール内のリンク（24時間有効）から会員情報のご登録にお進みください。
              </div>
              {devLink && (
                <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg p-4 text-xs space-y-2">
                  <p>※ メール送信（SMTP）が未設定のため、テスト用にリンクを表示しています。</p>
                  <Link href={devLink} className="text-brand-600 underline break-all">
                    {devLink}
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <input type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
                <input
                  type="email"
                  name="email"
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="example@email.com"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-brand-600 text-white font-bold py-3 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition"
              >
                {loading ? "送信中..." : "確認メールを送信"}
              </button>
            </form>
          )}

          <p className="text-center text-sm text-gray-500 mt-6">
            すでにアカウントをお持ちの方は{" "}
            <Link href="/login" className="text-brand-600 hover:underline font-medium">ログイン</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
