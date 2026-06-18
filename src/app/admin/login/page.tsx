"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"credentials" | "2fa">("credentials");
  const [totpCode, setTotpCode] = useState("");

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const fd = new FormData(e.currentTarget);
    const result = await signIn("admin-credentials", {
      email: fd.get("email"),
      password: fd.get("password"),
      redirect: false,
    });

    if (result?.error) {
      setError("メールアドレスまたはパスワードが正しくありません");
      setLoading(false);
    } else {
      // TODO: 2FA対応 - ここでtwoFactorEnabledをチェックして2FA画面へ
      router.push("/admin/dashboard");
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">管理画面</h1>
          <p className="text-gray-400 text-sm mt-1">トレカビンクス PSAシステム</p>
        </div>

        <div className="bg-white rounded-2xl p-8">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-6 text-sm">
              {error}
            </div>
          )}

          {step === "credentials" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
                <input
                  type="email"
                  name="email"
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">パスワード</label>
                <input
                  type="password"
                  name="password"
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-brand-600 text-white font-bold py-3 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition"
              >
                {loading ? "ログイン中..." : "ログイン"}
              </button>
            </form>
          )}

          {step === "2fa" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">認証アプリに表示された6桁のコードを入力してください</p>
              <input
                type="text"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                maxLength={6}
                pattern="\d{6}"
                placeholder="000000"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                onClick={() => {
                  // TODO: TOTP検証
                  router.push("/admin/dashboard");
                }}
                disabled={totpCode.length !== 6}
                className="w-full bg-brand-600 text-white font-bold py-3 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition"
              >
                確認
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
