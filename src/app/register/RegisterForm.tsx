"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { registerCustomer } from "@/actions/customer";

const PREFECTURES = [
  "北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県",
  "茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県",
  "新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県",
  "静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県",
  "奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県",
  "徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県",
  "熊本県","大分県","宮崎県","鹿児島県","沖縄県",
];

const inputCls =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";

export default function RegisterForm({ email, token }: { email: string; token: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const fd = new FormData(e.currentTarget);
    const result = await registerCustomer({
      name: fd.get("name") as string,
      nameKana: fd.get("nameKana") as string,
      email,
      phone: fd.get("phone") as string,
      postalCode: (fd.get("postalCode") as string).replace(/-/g, ""),
      prefecture: fd.get("prefecture") as string,
      address: fd.get("address") as string,
      address2: (fd.get("address2") as string) || undefined,
      password: fd.get("password") as string,
      token,
      hp: (fd.get("company") as string) || undefined,
    });

    if (result.success) {
      router.push("/mypage");
    } else {
      setError(result.error ?? "登録に失敗しました");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="w-full max-w-lg mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">会員情報の登録</h1>
          <p className="text-center text-gray-500 text-sm mb-6">トレカビンクス PSA申込</p>

          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 mb-6 text-sm">
            メール認証が完了しました（{email}）。続けて会員情報をご登録ください。
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-6 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <input type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">氏名 <span className="text-red-500">*</span></label>
                <input type="text" name="name" required className={inputCls} placeholder="山田 太郎" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">フリガナ <span className="text-red-500">*</span></label>
                <input type="text" name="nameKana" required className={inputCls} placeholder="ヤマダ タロウ" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス（認証済み）</label>
              <input type="email" value={email} disabled className={`${inputCls} bg-gray-50 text-gray-500`} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">電話番号 <span className="text-red-500">*</span></label>
              <input type="tel" name="phone" required pattern="[0-9\-+() ]{10,20}" className={inputCls} placeholder="090-1234-5678" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">郵便番号 <span className="text-red-500">*</span></label>
                <input type="text" name="postalCode" required pattern="\d{7}" className={inputCls} placeholder="1234567" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">都道府県 <span className="text-red-500">*</span></label>
                <select name="prefecture" required className={inputCls}>
                  <option value="">選択</option>
                  {PREFECTURES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">住所 <span className="text-red-500">*</span></label>
              <input type="text" name="address" required className={inputCls} placeholder="市区町村・番地" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">建物名・部屋番号</label>
              <input type="text" name="address2" className={inputCls} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">パスワード <span className="text-red-500">*</span></label>
              <input type="password" name="password" required minLength={8} className={inputCls} placeholder="8文字以上" />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-600 text-white font-bold py-3 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition mt-2"
            >
              {loading ? "登録中..." : "会員登録"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
