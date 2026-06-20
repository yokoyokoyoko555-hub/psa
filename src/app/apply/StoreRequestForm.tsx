"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createStoreRequest } from "@/actions/application";
import { ServiceRegion, ReturnMethod } from "@prisma/client";
import type { CustomerProfile } from "@/actions/customer";
import type { Address } from "@/actions/address";

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

type PaymentMethodOption = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
};

type Props = {
  profile: CustomerProfile | null;
  addresses: Address[];
  paymentMethods: PaymentMethodOption[];
};

function getProfileAddress(profile: CustomerProfile | null) {
  if (!profile) return null;
  return {
    id: "profile",
    label: "登録住所",
    name: profile.name,
    lastName: profile.lastName,
    firstName: profile.firstName,
    lastNameRoman: profile.lastNameRoman,
    firstNameRoman: profile.firstNameRoman,
    postalCode: profile.postalCode,
    prefecture: profile.prefecture,
    address: profile.address,
    address2: profile.address2,
    phone: profile.phone,
  };
}

function normalizeBrand(brand: string) {
  return brand ? brand.toUpperCase() : "CARD";
}

export default function StoreRequestForm({ profile, addresses, paymentMethods }: Props) {
  const router = useRouter();
  const [region, setRegion] = useState<ServiceRegion>("PSA_JP");
  const [returnMethod, setReturnMethod] = useState<ReturnMethod>("SHIPPING");
  const addressOptions = [
    ...(getProfileAddress(profile) ? [getProfileAddress(profile)!] : []),
    ...addresses.map((a) => ({
      id: a.id,
      label: a.isDefault ? "返送先住所（デフォルト）" : "返送先住所",
      name: a.name,
      lastName: a.lastName,
      firstName: a.firstName,
      lastNameRoman: a.lastNameRoman,
      firstNameRoman: a.firstNameRoman,
      postalCode: a.postalCode,
      prefecture: a.prefecture,
      address: a.address,
      address2: a.address2,
      phone: a.phone,
    })),
  ];
  const [addressId, setAddressId] = useState(addressOptions[0]?.id ?? "");
  const selectedAddress = addressOptions.find((a) => a.id === addressId) ?? addressOptions[0];
  const [shippingPhone, setShippingPhone] = useState(selectedAddress?.phone ?? profile?.phone ?? "");
  const [paymentMethodId, setPaymentMethodId] = useState(paymentMethods[0]?.id ?? "");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    if (!agreed) {
      setError("利用規約に同意してください");
      return;
    }
    if (!selectedAddress) {
      setError("発送先情報を登録してください");
      return;
    }
    if (!/^[0-9-+() ]{10,20}$/.test(shippingPhone.trim())) {
      setError("電話番号を入力してください");
      return;
    }
    if (!paymentMethodId) {
      setError("支払い方法を選択してください");
      return;
    }
    setLoading(true);
    setError("");
    const result = await createStoreRequest({
      region,
      returnMethod,
      returnAddress: {
        name: selectedAddress.name,
        lastName: selectedAddress.lastName,
        firstName: selectedAddress.firstName,
        lastNameRoman: selectedAddress.lastNameRoman,
        firstNameRoman: selectedAddress.firstNameRoman,
        postalCode: selectedAddress.postalCode,
        prefecture: selectedAddress.prefecture,
        address: selectedAddress.address,
        address2: selectedAddress.address2,
      },
      shippingPhone: shippingPhone.trim(),
      savedPaymentMethodId: paymentMethodId,
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

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-bold text-gray-800">発送先情報</h3>
          <Link href="/mypage/addresses" className="text-sm font-bold text-brand-600 hover:underline">
            返送先を管理
          </Link>
        </div>
        {addressOptions.length > 0 ? (
          <div className="space-y-3">
            {addressOptions.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  setAddressId(a.id);
                  setShippingPhone(a.phone ?? profile?.phone ?? "");
                }}
                className={`w-full rounded-xl border-2 p-4 text-left transition ${
                  addressId === a.id
                    ? "border-brand-500 bg-brand-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold text-gray-900">{a.label}</p>
                  {addressId === a.id && <span className="text-sm font-bold text-brand-700">選択中</span>}
                </div>
                <p className="mt-2 text-sm text-gray-700">{a.name}</p>
                <p className="text-sm text-gray-600">
                  〒{a.postalCode} {a.prefecture}{a.address}{a.address2 ?? ""}
                </p>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            発送先情報がありません。マイページで返送先を登録してください。
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h3 className="font-bold text-gray-800">電話番号</h3>
        <input
          type="tel"
          value={shippingPhone}
          onChange={(e) => setShippingPhone(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-3 text-sm focus:border-brand-500 focus:outline-none"
          placeholder="09012345678"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-bold text-gray-800">支払方法</h3>
          <Link href="/mypage/payment-methods" className="text-sm font-bold text-brand-600 hover:underline">
            支払い方法を管理
          </Link>
        </div>
        {paymentMethods.length > 0 ? (
          <div className="space-y-3">
            {paymentMethods.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setPaymentMethodId(m.id)}
                className={`w-full rounded-xl border-2 p-4 text-left transition ${
                  paymentMethodId === m.id
                    ? "border-brand-500 bg-brand-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold text-gray-900">
                    {normalizeBrand(m.brand)} •••• {m.last4}
                  </p>
                  {m.isDefault && <span className="rounded-full bg-brand-100 px-2 py-1 text-xs font-bold text-brand-700">既定</span>}
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  有効期限 {String(m.expMonth).padStart(2, "0")}/{m.expYear}
                </p>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            支払い方法が登録されていません。料金確定時の決済に使用するカードを登録してください。
          </div>
        )}
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
