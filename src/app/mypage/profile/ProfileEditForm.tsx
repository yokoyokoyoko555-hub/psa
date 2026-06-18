"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateCustomerProfile } from "@/actions/customer";
import type { CustomerProfile } from "@/actions/customer";

export default function ProfileEditForm({ profile }: { profile: CustomerProfile }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSaved(false);
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    const result = await updateCustomerProfile({
      name: String(fd.get("name") ?? ""),
      nameKana: String(fd.get("nameKana") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      postalCode: String(fd.get("postalCode") ?? ""),
      prefecture: String(fd.get("prefecture") ?? ""),
      address: String(fd.get("address") ?? ""),
      address2: String(fd.get("address2") ?? ""),
    });

    setLoading(false);
    if (result.success) {
      setSaved(true);
      router.refresh();
    } else {
      setError(result.error ?? "更新に失敗しました");
    }
  }

  const inputCls =
    "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500";

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
      )}
      {saved && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">
          登録情報を更新しました。
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">会員番号</label>
          <input value={profile.memberNo ?? "—"} disabled className={`${inputCls} bg-gray-50 text-gray-500`} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">メールアドレス（変更不可）</label>
          <input value={profile.email} disabled className={`${inputCls} bg-gray-50 text-gray-500`} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">お名前 *</label>
          <input name="name" defaultValue={profile.name} required className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">フリガナ *</label>
          <input name="nameKana" defaultValue={profile.nameKana} required className={inputCls} />
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">電話番号 *</label>
        <input name="phone" defaultValue={profile.phone} required className={inputCls} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">郵便番号（ハイフンなし7桁） *</label>
          <input name="postalCode" defaultValue={profile.postalCode} required className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">都道府県 *</label>
          <input name="prefecture" defaultValue={profile.prefecture} required className={inputCls} />
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">住所 *</label>
        <input name="address" defaultValue={profile.address} required className={inputCls} />
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">建物名・部屋番号など</label>
        <input name="address2" defaultValue={profile.address2 ?? ""} className={inputCls} />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-brand-600 text-white font-bold py-3 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition"
      >
        {loading ? "保存中..." : "更新する"}
      </button>
    </form>
  );
}
