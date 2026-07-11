"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { requestRegistration, loginCustomer, requestPasswordReset } from "@/actions/customer";

const inputCls =
  "w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";

const SOCIALS = [
  { key: "apple", label: "Appleでサインアップ", cls: "bg-black text-white" },
  { key: "google", label: "Googleで登録", cls: "bg-white text-gray-800 border border-gray-300" },
  { key: "line", label: "LINEで登録", cls: "bg-[#06C755] text-white" },
];

export default function AuthScreen({
  initialTab = "signup",
  withHeader = true,
  footer,
}: {
  initialTab?: "signup" | "login";
  withHeader?: boolean;
  // Footerは非同期のServer Componentのため、呼び出し元(Server Component)から要素として渡す。
  footer?: ReactNode;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"signup" | "login">(initialTab);
  const [showEmail, setShowEmail] = useState(false);
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // signup（メール送信）
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);

  // パスワード再設定
  const [forgot, setForgot] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetDevLink, setResetDevLink] = useState<string | null>(null);

  function switchTab(t: "signup" | "login") {
    setTab(t);
    setShowEmail(false);
    setInfo("");
    setError("");
    setSent(false);
    setForgot(false);
    setResetSent(false);
  }

  async function handleForgot(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const res = await requestPasswordReset({
      email: fd.get("email") as string,
      hp: (fd.get("company") as string) || undefined,
    });
    setLoading(false);
    if (res.success) {
      setResetSent(true);
      setResetDevLink(res.devLink ?? null);
    } else {
      setError("送信に失敗しました");
    }
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
    <div className="min-h-[100dvh] bg-white flex flex-col">
      {withHeader && (
        <header className="bg-white border-b border-gray-200 px-4 py-3">
          <div className="max-w-6xl mx-auto">
            <Link href="/" className="inline-block hover:opacity-70 transition">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.jpg" alt="トレカビンクス" className="h-12 w-auto" />
            </Link>
          </div>
        </header>
      )}

      {/* ロゴ・タグライン */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-6 pb-3">
        {!withHeader && (
          <Link href="/" className="inline-block mb-3 hover:opacity-70 transition">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpg" alt="トレカビンクス" className="h-16 w-auto" />
          </Link>
        )}
        <p className="text-base font-bold text-gray-700 mb-1">PSA鑑定始めるならトレカビンクス！</p>
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
          ) : forgot ? (
            resetSent ? (
              <div className="space-y-3">
                <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-4 text-sm">
                  ご登録のメールアドレス宛に、パスワード再設定のリンク（1時間有効）をお送りしました。メールをご確認ください。
                </div>
                {resetDevLink && (
                  <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg p-4 text-xs space-y-2">
                    <p>※ メール送信（SMTP）が未設定のため、テスト用にリンクを表示しています。</p>
                    <Link href={resetDevLink} className="text-brand-600 underline break-all">{resetDevLink}</Link>
                  </div>
                )}
                <button
                  onClick={() => { setForgot(false); setResetSent(false); }}
                  className="w-full text-sm text-gray-500 hover:text-gray-700"
                >
                  ← ログインに戻る
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgot} className="space-y-3 pt-1">
                <p className="text-sm text-gray-600">
                  ご登録のメールアドレスを入力してください。パスワード再設定用のリンクをお送りします。
                </p>
                <input type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
                <input type="email" name="email" required placeholder="メールアドレス" className={inputCls} />
                <button type="submit" disabled={loading} className="w-full bg-brand-600 text-white font-bold py-3 rounded-lg hover:bg-brand-700 disabled:opacity-50">
                  {loading ? "送信中..." : "再設定リンクを送信"}
                </button>
                <button
                  type="button"
                  onClick={() => setForgot(false)}
                  className="w-full text-sm text-gray-500 hover:text-gray-700"
                >
                  ← ログインに戻る
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
              <button
                type="button"
                onClick={() => { setForgot(true); setError(""); }}
                className="w-full text-center text-sm text-brand-600 hover:underline"
              >
                パスワードをお忘れの方
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

      {footer}
    </div>
  );
}
