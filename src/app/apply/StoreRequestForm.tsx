"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createStoreRequest } from "@/actions/application";
import { ServiceRegion, ReturnMethod } from "@prisma/client";

const REGION_LABELS: Record<ServiceRegion, string> = {
  PSA_JP: "PSA 日本",
  PSA_US: "PSA US",
};

const AGREEMENT_TEXT = `PSA鑑定受付代行サービス（代理申込）利用規約

1. 本サービスはカードのPSA鑑定を代行するサービスです。
2. 代理申込では、当社スタッフがカード明細・サービスを入力のうえ料金が確定します。
3. 料金確定時、登録済みのクレジットカードより即時決済が行われます。
4. お申込み後のキャンセルはお受けできません。
5. PSAからUpchargeが発生した場合、登録済みのカードへ追加請求を行います。
6. 鑑定中の紛失・破損は保険適用範囲内で対応します。
7. PSAグレードの結果に関して当社は責任を負いません。`;
const AGREEMENT_VERSION = "store-v1.0";

export default function StoreRequestForm() {
  const router = useRouter();
  const [region, setRegion] = useState<ServiceRegion>("PSA_JP");
  const [returnMethod, setReturnMethod] = useState<ReturnMethod>("SHIPPING");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    if (!agreed) {
      setError("利用規約に同意してください");
      return;
    }
    setLoading(true);
    setError("");
    const result = await createStoreRequest({
      region,
      returnMethod,
      agreementText: AGREEMENT_TEXT,
      agreementVersion: AGREEMENT_VERSION,
      ipAddress: "",
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    });
    setLoading(false);
    if (result.success) {
      setDone(true);
    } else {
      setError(result.error ?? "送信に失敗しました");
    }
  }

  if (done) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center space-y-4">
        <div className="text-4xl">✅</div>
        <h2 className="text-lg font-bold text-gray-900">代理申込の依頼を受け付けました</h2>
        <p className="text-sm text-gray-600">
          当社スタッフがカード内容を入力し、料金確定後に登録カードへご請求します。
          進捗はマイページでご確認いただけます。
        </p>
        <button
          onClick={() => router.push("/mypage")}
          className="bg-brand-600 text-white font-bold px-6 py-3 rounded-lg hover:bg-brand-700 transition"
        >
          マイページへ
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-gray-900">代理申込の依頼（当社がカードを入力します）</h2>
      <p className="text-sm text-gray-600">
        カードを当社にお預けいただき、スタッフが明細を入力します。提出先と返却方法を選んでご依頼ください。
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h3 className="font-bold text-gray-800">鑑定提出先</h3>
        <div className="grid grid-cols-2 gap-3">
          {(["PSA_JP", "PSA_US"] as ServiceRegion[]).map((r) => (
            <button
              key={r}
              onClick={() => setRegion(r)}
              className={`border-2 rounded-xl p-4 text-center font-bold transition ${
                region === r
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-gray-200 text-gray-700 hover:border-gray-300"
              }`}
            >
              {REGION_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h3 className="font-bold text-gray-800">返却方法</h3>
        <div className="grid grid-cols-2 gap-3">
          {(["STORE_PICKUP", "SHIPPING"] as ReturnMethod[]).map((m) => (
            <button
              key={m}
              onClick={() => setReturnMethod(m)}
              className={`border-2 rounded-xl p-4 text-center font-bold transition ${
                returnMethod === m
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-gray-200 text-gray-700 hover:border-gray-300"
              }`}
            >
              {m === "STORE_PICKUP" ? "店頭受取" : "配送"}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
        <h3 className="font-bold text-gray-800">利用規約</h3>
        <pre className="text-xs text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-lg p-3 max-h-40 overflow-y-auto">
          {AGREEMENT_TEXT}
        </pre>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          利用規約に同意します
        </label>
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full bg-brand-600 text-white font-bold py-4 rounded-xl hover:bg-brand-700 disabled:opacity-50 transition"
      >
        {loading ? "送信中..." : "代理申込を依頼する"}
      </button>
    </div>
  );
}
