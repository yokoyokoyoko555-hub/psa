"use client";

import { useState } from "react";
import Link from "next/link";
import { createStoreRequest, confirmStorePrepayPayment } from "@/actions/application";
import { ServiceRegion, ReturnMethod, ItemType } from "@prisma/client";
import type { PricingSetting } from "@prisma/client";
import type { CustomerProfile } from "@/actions/customer";
import type { Address } from "@/actions/address";
import { formatMoneyIn } from "@/lib/currency";
import StripeCardPayment from "@/components/StripeCardPayment";
import PaymentDoneScreen from "@/components/PaymentDoneScreen";

const REGION_LABELS: Record<ServiceRegion, string> = {
  PSA_JP: "PSA 日本",
  PSA_US: "PSA US",
};

const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  TRADING_CARD: "トレーディングカード",
  UNOPENED_PACK: "未開封パック",
  COMIC_MAGAZINE: "コミック・マガジン",
};

const AGREEMENT_TEXT = `PSA鑑定受付代行サービス（代理入力・先払い）利用規約

1. 代理入力では、お客様に入力いただくのは代理入力する枚数・返送先・電話番号・クレジットカード情報のみです。
2. お申込み時には、代理入力する枚数×代理入力費用（消費税込み）を先にお支払いいただきます。事務手数料は、実際のサービスが確定した際に別途ご請求します。
3. お支払い後、カードのお預け（店頭持込・郵送）をご予約ください。
4. 当社で代理入力が完了次第、ご提出いただいたカードの内容に応じた鑑定料を別途メールにてご請求いたします。
5. お申込み後のキャンセルはお受けできません。
6. PSAからUpchargeが発生した場合、追加請求をご案内します。
7. 鑑定中の紛失・破損は保険適用範囲内で対応します。
8. PSAグレードの結果に関して当社は責任を負いません。`;
const AGREEMENT_VERSION = "store-v3.0";

type Props = {
  profile: CustomerProfile | null;
  addresses: Address[];
  pricingSettings: PricingSetting[];
  stripePublishableKey: string;
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

export default function StoreRequestForm({ profile, addresses, pricingSettings, stripePublishableKey }: Props) {
  const [region, setRegion] = useState<ServiceRegion>("PSA_JP");
  const [itemType, setItemType] = useState<ItemType>("TRADING_CARD");
  // 代理入力数（同一カードは1としてカウント）。実際のサービスレベル・鑑定料はカードお預け後にスタッフが確定する。ADR-0026
  const [agencyQuantity, setAgencyQuantity] = useState<number>(0);
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
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<"form" | "payment" | "done">("form");
  const [clientSecret, setClientSecret] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);

  const setting = pricingSettings.find((p) => p.region === region && p.itemType === itemType);
  const proxyFee = setting?.proxyFee ?? 0;
  const agencyFeeTotal = proxyFee * agencyQuantity;
  // 代理入力費用は内税（消費税を別途加算しない）。事務手数料はサービス単位で確定時に別途請求するため、ここには含めない。
  const prepaidAmount = agencyFeeTotal;
  const innerTax = Math.floor((agencyFeeTotal * 10) / 110);

  async function handleSubmit() {
    if (agencyQuantity < 1) {
      setError("代理入力数を入力してください");
      return;
    }
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
    setLoading(true);
    setError("");
    try {
      const result = await createStoreRequest({
        region,
        itemType,
        agencyQuantity,
        returnMethod,
        returnAddress: {
          name: selectedAddress.name,
          lastName: selectedAddress.lastName || undefined,
          firstName: selectedAddress.firstName || undefined,
          lastNameRoman: selectedAddress.lastNameRoman || undefined,
          firstNameRoman: selectedAddress.firstNameRoman || undefined,
          postalCode: selectedAddress.postalCode,
          prefecture: selectedAddress.prefecture,
          address: selectedAddress.address,
          address2: selectedAddress.address2 || undefined,
        },
        shippingPhone: shippingPhone.trim(),
        agreementText: AGREEMENT_TEXT,
        agreementVersion: AGREEMENT_VERSION,
        ipAddress: "",
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      });
      if (result.success && result.clientSecret) {
        setCreatedId(result.applicationId ?? null);
        setClientSecret(result.clientSecret);
        setStep("payment");
      } else {
        setError(result.error ?? "送信に失敗しました");
      }
    } catch (err) {
      console.error(err);
      setError("送信中にエラーが発生しました。時間をおいて再度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  async function handlePaid(paymentIntentId: string) {
    if (!createdId) {
      setError("決済は完了しましたが、申込情報の確認に失敗しました。マイページからご確認ください。");
      return;
    }
    const confirmed = await confirmStorePrepayPayment({ applicationId: createdId, paymentIntentId });
    if (confirmed.success) {
      setStep("done");
    } else {
      setError(
        confirmed.error ??
          "決済は完了しましたが、反映に時間がかかっています。少し待ってからカード提出予約へ進んでください。"
      );
    }
  }

  if (step === "done") {
    return (
      <PaymentDoneScreen
        applicationId={createdId}
        extraNote="お預かり後、当社で代理入力を行い、内容に応じた鑑定料を別途メールにてご請求します。"
      />
    );
  }

  if (step === "payment") {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-bold text-gray-900">代理入力費用のお支払い</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
          <div className="flex justify-between text-sm text-gray-700">
            <span>代理入力数 {agencyQuantity} 点 × 代理入力料（{formatMoneyIn(proxyFee, "JPY")}/点）</span>
            <span>{formatMoneyIn(agencyFeeTotal, "JPY")}</span>
          </div>
          <p className="text-xs text-gray-500 text-right">（内消費税 {formatMoneyIn(innerTax, "JPY")}）</p>
          <div className="border-t border-gray-200 pt-3 flex justify-between font-bold text-gray-900">
            <span>合計金額</span>
            <span>{formatMoneyIn(prepaidAmount, "JPY")}</span>
          </div>
          <p className="text-xs text-gray-500">
            事務手数料・鑑定料は、当社で代理入力が完了次第、内容に応じて別途メールにてご請求します。
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <StripeCardPayment
            clientSecret={clientSecret}
            publishableKey={stripePublishableKey}
            buttonLabel={`${formatMoneyIn(prepaidAmount, "JPY")} を支払う`}
            billingName={profile?.name ?? "Customer"}
            onPaid={handlePaid}
            onError={setError}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-gray-900">代理入力の依頼（当社がカードを入力します）</h2>
      <p className="text-sm text-gray-600">
        代理入力では、お客様に入力いただくのは代理入力する枚数・返送先・電話番号・クレジットカード情報のみです。
        代理入力する枚数×代理入力費用のみ、先にお支払いいただきます。
        当社で代理入力完了後、ご提出いただいたカードに応じた鑑定料を別途メールにてご請求させていただきます。
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
              onClick={() => {
                setRegion(r);
                if (r === "PSA_JP") setItemType("TRADING_CARD");
              }}
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

      {region === "PSA_US" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h3 className="font-bold text-gray-800">アイテム種別</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(["TRADING_CARD", "UNOPENED_PACK", "COMIC_MAGAZINE"] as ItemType[]).map((it) => (
              <button
                key={it}
                onClick={() => setItemType(it)}
                className={`border-2 rounded-xl p-4 text-center font-bold transition ${
                  itemType === it
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-gray-200 text-gray-700 hover:border-gray-300"
                }`}
              >
                {ITEM_TYPE_LABELS[it]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h3 className="font-bold text-gray-800">代理入力数</h3>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-gray-500">同一カードは1としてカウントしてください。</p>
          <input
            type="number"
            min={1}
            max={500}
            placeholder="例: 5"
            value={agencyQuantity || ""}
            onChange={(e) => setAgencyQuantity(Math.max(0, Math.floor(Number(e.target.value)) || 0))}
            className="w-32 shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm text-right focus:border-brand-500 focus:outline-none"
          />
        </div>

        {agencyQuantity > 0 && (
          <div className="rounded-lg bg-gray-50 p-4 space-y-1 text-sm">
            <div className="flex justify-between text-gray-700">
              <span>代理入力数 {agencyQuantity} 点 × 代理入力料（{formatMoneyIn(proxyFee, "JPY")}/点）</span>
              <span>{formatMoneyIn(agencyFeeTotal, "JPY")}</span>
            </div>
            <p className="text-xs text-gray-500 text-right">（内消費税 {formatMoneyIn(innerTax, "JPY")}）</p>
            <div className="flex justify-between font-bold text-gray-900 pt-1 border-t border-gray-200">
              <span>合計金額</span>
              <span>{formatMoneyIn(prepaidAmount, "JPY")}</span>
            </div>
            <p className="text-xs text-gray-500 pt-1">
              事務手数料・鑑定料は、代理入力完了後にカード内容に応じて別途メールにてご請求します。
            </p>
          </div>
        )}
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
          <Link href="/mypage/settings#addresses" className="text-sm font-bold text-brand-600 hover:underline">
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
        {loading ? "送信中..." : "依頼して先払いへ進む"}
      </button>
    </div>
  );
}
