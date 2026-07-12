"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createInquiry } from "@/actions/inquiry";

const inputCls =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500";

export default function ContactForm({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [agreedHarassmentPolicy, setAgreedHarassmentPolicy] = useState(false);
  const [agreedPrivacyPolicy, setAgreedPrivacyPolicy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    if (!subject.trim() || !body.trim()) {
      setError("件名と内容を入力してください");
      return;
    }
    if (!agreedHarassmentPolicy || !agreedPrivacyPolicy) {
      setError("カスタマーハラスメントポリシー・個人情報の取り扱いへの同意が必要です");
      return;
    }
    setError("");
    setLoading(true);
    const result = await createInquiry({
      subject: subject.trim(),
      body: body.trim(),
      agreedHarassmentPolicy: true,
      agreedPrivacyPolicy: true,
    });
    setLoading(false);
    if (!result.success) {
      setError(result.error ?? "送信に失敗しました");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center space-y-4">
        <div className="text-4xl">✅</div>
        <h2 className="text-lg font-bold text-gray-900">お問い合わせを受け付けました</h2>
        <p className="text-sm text-gray-600">
          担当者より回答をお送りいたします。しばらくお待ちください。
        </p>
        <button
          onClick={() => router.push("/contact/history")}
          className="bg-brand-600 text-white font-bold px-6 py-3 rounded-lg hover:bg-brand-700 transition"
        >
          お問い合わせ履歴を見る
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">お名前</label>
            <input value={name} disabled className={`${inputCls} bg-gray-50 text-gray-500`} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">メールアドレス</label>
            <input value={email} disabled className={`${inputCls} bg-gray-50 text-gray-500`} />
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">件名 *</label>
          <input
            className={inputCls}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={120}
            placeholder="例: 返却方法の変更について"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">内容 *</label>
          <textarea
            className={`${inputCls} min-h-40`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={4000}
            placeholder="お問い合わせ内容をご記入ください"
          />
        </div>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg p-4 text-sm leading-relaxed">
        サブミッション番号の開示、グレード、鑑定の催促に関するお問合せについては回答致しかねますのでご了承ください。
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={agreedHarassmentPolicy}
            onChange={(e) => setAgreedHarassmentPolicy(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <Link href="/harassment-policy" target="_blank" className="text-brand-600 hover:underline">
              カスタマーハラスメントポリシー
            </Link>
            に同意します。スタッフへの暴言・脅迫・過度な要求等が確認された場合、回答をお断りする場合があります。
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={agreedPrivacyPolicy}
            onChange={(e) => setAgreedPrivacyPolicy(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <Link href="/privacy" target="_blank" className="text-brand-600 hover:underline">
              個人情報保護方針
            </Link>
            に同意の上、本お問い合わせを送信します。
          </span>
        </label>
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full bg-brand-600 text-white font-bold py-3 rounded-xl hover:bg-brand-700 disabled:opacity-50 transition"
      >
        {loading ? "送信中..." : "送信する"}
      </button>
    </div>
  );
}
