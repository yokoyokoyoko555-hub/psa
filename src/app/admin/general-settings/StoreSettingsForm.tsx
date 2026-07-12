"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveStoreSettings } from "@/actions/store-settings";

export default function StoreSettingsForm({
  postalCode,
  address,
  storeName,
  phone,
}: {
  postalCode: string;
  address: string;
  storeName: string;
  phone: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({ postalCode, address, storeName, phone });
  const [message, setMessage] = useState("");

  function save() {
    setMessage("");
    startTransition(async () => {
      const res = await saveStoreSettings(form);
      setMessage(res.success ? "保存しました" : res.error ?? "保存に失敗しました");
      if (res.success) router.refresh();
    });
  }

  const inputCls = "w-full border border-gray-300 rounded px-2 py-1 text-sm text-gray-900";

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        顧客が「郵送」を選ぶ際に表示する郵送先住所です。店舗移転等があればここを更新してください。
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-sm space-y-1">
          <span className="text-gray-700">郵便番号</span>
          <input value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} className={inputCls} placeholder="170-0013" />
        </label>
        <label className="text-sm space-y-1">
          <span className="text-gray-700">電話番号</span>
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} placeholder="03-6161-6330" />
        </label>
        <label className="text-sm space-y-1 sm:col-span-2">
          <span className="text-gray-700">住所</span>
          <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputCls} placeholder="東京都豊島区東池袋1丁目23-5 新大同ビル4階" />
        </label>
        <label className="text-sm space-y-1 sm:col-span-2">
          <span className="text-gray-700">店舗名・宛名</span>
          <input value={form.storeName} onChange={(e) => setForm({ ...form, storeName: e.target.value })} className={inputCls} placeholder="トレカビンクス池袋店　PSA鑑定" />
        </label>
      </div>
      <div className="flex items-center justify-end gap-3">
        {message && <span className="text-green-700 text-sm">{message}</span>}
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="bg-brand-600 text-white font-bold px-6 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50 text-sm"
        >
          {isPending ? "保存中..." : "保存"}
        </button>
      </div>
    </div>
  );
}
