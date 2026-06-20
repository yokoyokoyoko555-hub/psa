"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { requestRegistration, loginCustomer } from "@/actions/customer";

const inputCls =
  "w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";

const SOCIALS = [
  { key: "apple", label: "Appleでサインアップ", cls: "bg-black text-white" },
  { key: "google", label: "Googleで登録", cls: "bg-white text-gray-800 border border-gray-300" },
  { key: "line", label: "LINEで登録", cls: "bg-[#06C755] text-white" },
];

export default function AuthScreen({ initialTab = "signup" }: { initialTab?: "signup" | "login" }) {
  const router = useRouter();
  const [tab, setTab] = useState<"signup" | "login">(initialTab);
  const [showEmail, setShowEmail] = useState(false);
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // signup（メール送信）
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);

  function switchTab(t: "signup" | "login") {
    setTab(t);
    setShowEmail(false);
    setInfo("");
    setError("");
    setSent(false);
  }

  async function handleSignupEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const res = await requestRegistration({
      email: fd.get("email") as string,
      hp: (fd.get("company") as string) || undefined,
    });
    setLoading(false);
    if (res.success) {
      setSent(true);
      setDevLink(res.devLink ?? null);
    } else {
      setError(res.error ?? "送信に失敗しました");
    }
  }

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const res = await loginCustomer({
      email: fd.get("email") as string,
      password: fd.get("password") as string,
    });
    if (res.success) {
      router.push("/mypage");
    } else {
      setError(res.error ?? "ログインに失敗しました");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* ロゴ・タグライン */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-6 pb-3">
        <p className="text-base font-bold text-gray-700 mb-1">PSA鑑定始めるならトレカビンクス！</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.jpg" alt="トレカビンクス" className="h-16 w-auto" />
      </div>

      {/* タブ + フォーム */}
      <div className="border-t border-gray-200 px-6 pt-2 pb-8 max-w-md w-full mx-auto">
        <div className="flex">
          {(["signup", "login"] as const).map((t) => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              className={`flex-1 py-3 text-sm font-bold border-b-2 transition ${
                tab === t ? "border-brand-600 text-gray-900" : "border-transparent text-gray-400"
              }`}
            >
              {t === "signup" ? "新規登録" : "ログイン"}
            </button>
          ))}
        </div>

        <div className="mt-6 space-y-3">
          {info && (
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg p-3 text-sm">{info}</div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
          )}

          {/* SNSボタン（準備中） */}
          {SOCIALS.map((s) => (
            <button
              key={s.key}
              onClick={() => setInfo("ソーシャルログインは準備中です。メールアドレスをご利用ください。")}
              className={`w-full py-3 rounded-lg text-sm font-bold ${s.cls}`}
            >
              {s.label.replace("登録", tab === "login" ? "ログイン" : "登録")}
            </button>
          ))}

          {/* メール */}
          {!showEmail ? (
            <button
              onClick={() => { setShowEmail(true); setInfo(""); }}
              className="w-full py-3 rounded-lg text-sm font-bold border border-gray-300 text-gray-800 hover:bg-gray-50"
            >
              メールアドレスで{tab === "signup" ? "登録" : "ログイン"}
            </button>
          ) : tab === "signup" ? (
            sent ? (
              <div className="space-y-3">
                <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-4 text-sm">
                  確認メールを送信しました。メール内のリンク（24時間有効）から会員情報のご登録にお進みください。
                </div>
                {devLink && (
                  <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg p-4 text-xs space-y-2">
                    <p>※ メール送信（SMTP）が未設定のため、テスト用にリンクを表示しています。</p>
                    <Link href={devLink} className="text-brand-600 underline break-all">{devLink}</Link>
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={handleSignupEmail} className="space-y-3 pt-1">
                <input type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
                <input type="email" name="email" required placeholder="メールアドレス" className={inputCls} />
                <button type="submit" disabled={loading} className="w-full bg-brand-600 text-white font-bold py-3 rounded-lg hover:bg-brand-700 disabled:opacity-50">
                  {loading ? "送信中..." : "確認メールを送信"}
                </button>
              </form>
            )
          ) : (
            <form onSubmit={handleLogin} className="space-y-3 pt-1">
              <input type="email" name="email" required placeholder="メールアドレス" className={inputCls} />
              <input type="password" name="password" required placeholder="パスワード" className={inputCls} />
              <button type="submit" disabled={loading} className="w-full bg-brand-600 text-white font-bold py-3 rounded-lg hover:bg-brand-700 disabled:opacity-50">
                {loading ? "ログイン中..." : "ログイン"}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          <Link href="/terms" className="text-brand-600 hover:underline">利用規約</Link>
          ・
          <Link href="/privacy" className="text-brand-600 hover:underline">個人情報保護方針</Link>
          に同意の上、ご利用ください
        </p>
      </div>
    </div>
  );
}
