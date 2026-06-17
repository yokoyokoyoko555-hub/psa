"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

export default function RegisterPage() {
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
      email: fd.get("email") as string,
      phone: fd.get("phone") as string,
      postalCode: (fd.get("postalCode") as string).replace(/-/g, ""),
      prefecture: fd.get("prefecture") as string,
      address: fd.get("address") as string,
      address2: fd.get("address2") as string || undefined,
      password: fd.get("password") as string,
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
          <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">新規会員登録</h1>
          <p className="text-center text-gray-500 text-sm mb-8">トレカビンクス PSA申込</p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-6 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">氏名 <span className="text-red-500">*</span></label>
                <input type="text" name="name" required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="山田 太郎" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">フリガナ <span className="text-red-500">*</span></label>
                <input type="text" name="nameKana" required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="ヤマダ タロウ" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス <span className="text-red-500">*</span></label>
              <input type="email" name="email" required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">電話番号 <span className="text-red-500">*</span></label>
              <input type="tel" name="phone" required pattern="[0-9\-+() ]{10,20}" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="090-1234-5678" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">郵便番号 <span className="text-red-500">*</span></label>
                <input type="text" name="postalCode" required pattern="\d{7}" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="1234567" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">都道府県 <span className="text-red-500">*</span></label>
                <select name="prefecture" required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">選択</option>
                  {PREFECTURES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">住所 <span className="text-red-500">*</span></label>
              <input type="text" name="address" required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="市区町村・番地" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">建物名・部屋番号</label>
              <input type="text" name="address2" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">パスワード <span className="text-red-500">*</span></label>
              <input type="password" name="password" required minLength={8} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="8文字以上" />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition mt-2"
            >
              {loading ? "登録中..." : "会員登録"}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            すでにアカウントをお持ちの方は{" "}
            <Link href="/login" className="text-blue-600 hover:underline font-medium">ログイン</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
