"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveUniformFees } from "@/actions/pricing";

export default function HandlingFeeForm({
  region,
  unit,
  proxyFee,
  handlingFee,
  freeShipInsQty,
}: {
  region: "PSA_JP" | "PSA_US";
  unit: string;
  proxyFee: number;
  handlingFee: number;
  freeShipInsQty: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [proxy, setProxy] = useState(String(proxyFee));
  const [handling, setHandling] = useState(String(handlingFee));
  const [freeQty, setFreeQty] = useState(String(freeShipInsQty));
  const [message, setMessage] = useState("");

  function save() {
    setMessage("");
    startTransition(async () => {
      const res = await saveUniformFees({
        region,
        proxyFee: parseInt(proxy) || 0,
        handlingFee: parseInt(handling) || 0,
        freeShipInsQty: parseInt(freeQty) || 0,
      });
      setMessage(res.success ? "保存しました" : res.error ?? "保存に失敗しました");
      if (res.success) router.refresh();
    });
  }

  const inputCls = "w-32 border border-gray-300 rounded px-2 py-1 text-sm text-gray-900";

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        いずれもサービス共通の一律額（{unit}/枚）です。枚数に応じて加算されます。
        代理入力料金は代理入力(STORE)の申込のみ、事務手数料は全申込に適用されます。
      </p>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-28 text-sm text-gray-700">代理入力料金</span>
          <input type="number" min={0} value={proxy} onChange={(e) => setProxy(e.target.value)} className={inputCls} />
          <span className="text-sm text-gray-600">{unit} / 枚</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-28 text-sm text-gray-700">事務手数料</span>
          <input type="number" min={0} value={handling} onChange={(e) => setHandling(e.target.value)} className={inputCls} />
          <span className="text-sm text-gray-600">{unit} / 枚</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-28 text-sm text-gray-700">送料保険 無料化</span>
          <input type="number" min={0} value={freeQty} onChange={(e) => setFreeQty(e.target.value)} className={inputCls} />
          <span className="text-sm text-gray-600">枚以上で送料・保険を無料（0=無効）</span>
        </div>
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
