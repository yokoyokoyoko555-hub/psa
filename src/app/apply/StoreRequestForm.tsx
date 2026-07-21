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
import { renderLegalMarkdown } from "@/lib/legal-markdown";
import type { TermsDocument } from "./termsDocument";

const REGION_LABELS: Record<ServiceRegion, string> = {
  PSA_JP: "PSA 日本",
  PSA_US: "PSA US",
};

// AUTOGRAPHはitemTypeとして選択されない（TRADING_CARD内のデュアルサービス）ため未使用。
// Record<ItemType,...>の網羅性を満たすためのプレースホルダー。ADR-0043
const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  TRADING_CARD: "トレーディングカード",
  UNOPENED_PACK: "未開封パック",
  COMIC_MAGAZINE: "コミック・マガジン",
  AUTOGRAPH: "オートグラフ",
};

// 代理入力（先払い→後日確定分請求）特有の流れの説明。利用規約の同意対象ではなく、単なる案内文。ADR-0077
const PROXY_FLOW_NOTE = [
  "代理入力では、お客様に入力いただくのは代理入力する枚数・申込総数・返送先・電話番号・クレジットカード情報のみです。",
  "お申込み時には、代理入力種類×代理入力費用 （税込1,100円）を先にお支払いいただきます。",
  "代理入力料のお支払い後に、カードのお預け（店頭持込・郵送）をご予約ください。",
  "当社で代理入力が完了次第、ご提出いただいたカードの内容に応じた鑑定および事務手数料を別途メールにてご請求いたします。",
];

/** 制定済み利用規約(LegalDocument"terms")のバージョン識別子。改訂があれば最新改訂日、無ければ制定日。ADR-0077 */
function termsVersion(doc: TermsDocument): string {
  const latest = doc.revisedAt.length > 0 ? doc.revisedAt[doc.revisedAt.length - 1] : doc.establishedAt;
  return new Date(latest).toISOString().slice(0, 10);
}

type Props = {
  profile: CustomerProfile | null;
  addresses: Address[];
  pricingSettings: PricingSetting[];
  stripePublishableKey: string;
  termsDocument: TermsDocument | null;
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

export default function StoreRequestForm({ profile, addresses, pricingSettings, stripePublishableKey, termsDocument }: Props) {
  const [region, setRegion] = useState<ServiceRegion>("PSA_JP");
  const [itemType, setItemType] = useState<ItemType>("TRADING_CARD");
  // 代理入力種類（同一カードは1としてカウント）。実際のサービスレベル・鑑定料はカードお預け後にスタッフが確定する。ADR-0026
  const [agencyQuantity, setAgencyQuantity] = useState<number>(0);
  // 申込総数（あくまで当社の総量把握のための参考値。料金計算には使わない）。ADR-0037
  const [estimatedTotalCount, setEstimatedTotalCount] = useState<number>(0);
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

  // 管理画面でOFFにされたアイテム種別は選択肢から除外する（未設定なら有効扱い）。ADR-0043
  const enabledItemTypes = (["TRADING_CARD", "UNOPENED_PACK", "COMIC_MAGAZINE"] as ItemType[]).filter(
    (it) => (pricingSettings.find((p) => p.region === "PSA_US" && p.itemType === it)?.enabled ?? true)
  );

  const setting = pricingSettings.find((p) => p.region === region && p.itemType === itemType);
  const proxyFee = setting?.proxyFee ?? 0;
  const agencyFeeTotal = proxyFee * agencyQuantity;
  // 代理入力費用は内税（消費税を別途加算しない）。事務手数料はサービス単位で確定時に別途請求するため、ここには含めない。
  const prepaidAmount = agencyFeeTotal;
  const innerTax = Math.floor((agencyFeeTotal * 10) / 110);

  async function handleSubmit() {
    if (agencyQuantity < 1) {
      setError("代理入力種類を入力してください");
      return;
    }
    if (estimatedTotalCount < 1) {
      setError("申込総数を入力してください");
      return;
    }
    if (!agreed) {
      setError("利用規約に同意してください");
      return;
    }
    if (!termsDocument) {
      setError("利用規約の読み込みに失敗しました。時間をおいて再度お試しください。");
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
        estimatedTotalCount,
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
        agreementText: termsDocument.body,
        agreementVersion: termsVersion(termsDocument),
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
          "決済は完了しましたが、反映に時間がかかっています。少し待ってから提出予約へ進んでください。"
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
            <span>代理入力種類 {agencyQuantity} 点 × 代理入力料（{formatMoneyIn(proxyFee, "JPY")}/点）</span>
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
        代理入力では、お客様に入力いただくのは代理入力する枚数・申込総数・返送先・電話番号・クレジットカード情報のみです。
        代理入力する枚数×代理入力費用のみ、先にお支払いいただきます。
        当社で代理入力完了後、ご提出いただいたカードに応じた鑑定料を別途メールにてご請求させていただきます。
      </p>

      {error && (
        <div className="sticky top-[72px] z-10 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm shadow-md">
          {error}
        </div>
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

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h3 className="font-bold text-gray-800">アイテム種別</h3>
        {region === "PSA_US" ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {enabledItemTypes.map((it) => (
              <button
                key={it}
                onClick={() => setItemType(it)}
                className={`border-2 rounded-xl p-4 text-center font-bold whitespace-nowrap transition ${
                  itemType === it
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-gray-200 text-gray-700 hover:border-gray-300"
                }`}
              >
                {ITEM_TYPE_LABELS[it]}
              </button>
            ))}
          </div>
        ) : (
          <div className="border-2 border-brand-500 bg-brand-50 text-brand-700 rounded-xl p-4 text-center font-bold">
            {ITEM_TYPE_LABELS.TRADING_CARD}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h3 className="font-bold text-gray-800">代理入力種類・申込総数</h3>
        <div className="flex items-center justify-between gap-3">
          <label className="text-sm font-bold text-gray-700">代理入力種類</label>
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
        <p className="text-xs text-gray-500">同一カードは1としてカウントしてください。</p>

        <div className="flex items-center justify-between gap-3 pt-2 border-t border-gray-100">
          <label className="text-sm font-bold text-gray-700">申込総数</label>
          <input
            type="number"
            min={1}
            max={5000}
            placeholder="例: 20"
            value={estimatedTotalCount || ""}
            onChange={(e) => setEstimatedTotalCount(Math.max(0, Math.floor(Number(e.target.value)) || 0))}
            className="w-32 shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm text-right focus:border-brand-500 focus:outline-none"
          />
        </div>
        <p className="text-xs text-gray-500">
          お預けいただく総数の目安です。当社の受入準備のための参考情報で、料金には影響しません。
        </p>

        {agencyQuantity > 0 && (
          <div className="rounded-lg bg-gray-50 p-4 space-y-1 text-sm">
            <div className="flex justify-between text-gray-700">
              <span>代理入力種類 {agencyQuantity} 点 × 代理入力料（{formatMoneyIn(proxyFee, "JPY")}/点）</span>
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
        <h3 className="font-bold text-gray-800">代理入力・先払いの流れ</h3>
        <ul className="text-xs text-gray-600 list-disc pl-4 space-y-1">
          {PROXY_FLOW_NOTE.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-800">利用規約</h3>
          <Link href="/terms" target="_blank" className="text-xs text-brand-600 hover:underline">
            全文を別ページで見る →
          </Link>
        </div>
        <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">
          {termsDocument ? (
            renderLegalMarkdown(termsDocument.body)
          ) : (
            <p className="text-gray-400">利用規約を読み込めませんでした。</p>
          )}
        </div>
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
