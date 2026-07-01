"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createStoreRequest, confirmStorePrepayPayment } from "@/actions/application";
import { ServiceRegion, ReturnMethod, ServiceLevel } from "@prisma/client";
import type { ServicePrice } from "@prisma/client";
import type { CustomerProfile } from "@/actions/customer";
import type { Address } from "@/actions/address";
import { formatMoney } from "@/lib/currency";
import StripeCardPayment from "@/components/StripeCardPayment";

const REGION_LABELS: Record<ServiceRegion, string> = {
  PSA_JP: "PSA 日本",
  PSA_US: "PSA US",
};

const SERVICE_LABELS: Record<ServiceLevel, string> = {
  VALUE: "バリュー",
  VALUE_BULK: "バリューバルク",
  VALUE_PLUS: "バリュープラス",
  VALUE_MAX: "バリューマックス",
  REGULAR: "レギュラー",
  EXPRESS: "エクスプレス",
  SUPER_EXPRESS: "スーパー・エクスプレス",
  WALK_THROUGH: "ウォーク・スルー",
  PREMIUM_1: "プレミアム 1",
  PREMIUM_2: "プレミアム 2",
  PREMIUM_3: "プレミアム 3",
  PREMIUM_5: "プレミアム 5",
  PREMIUM_10: "プレミアム 10",
};

const AGREEMENT_TEXT = `PSA鑑定受付代行サービス（代理申込・先払い）利用規約

1. 本サービスはカードのPSA鑑定を代行するサービスです。
2. 代理申込では、お申込み時に概算（カード枚数 × 鑑定料 ＋ 消費税）を先にお支払いいただきます。
3. お支払い後、カードのお預け（店頭持込・郵送）をご予約ください。
4. お預かり後、当社スタッフがカード明細を確定し、最終料金を算出します。
5. 代理入力料金・送料・保険料・事務手数料、および鑑定料の差額は、明細確定後に別途精算（追加請求）いたします。
6. お申込み後のキャンセルはお受けできません。
7. PSAからUpchargeが発生した場合、追加請求をご案内します。
8. 鑑定中の紛失・破損は保険適用範囲内で対応します。
9. PSAグレードの結果に関して当社は責任を負いません。`;
const AGREEMENT_VERSION = "store-v2.0";

type Props = {
  profile: CustomerProfile | null;
  addresses: Address[];
  servicePrices: ServicePrice[];
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

export default function StoreRequestForm({ profile, addresses, servicePrices, stripePublishableKey }: Props) {
  const router = useRouter();
  const [region, setRegion] = useState<ServiceRegion>("PSA_JP");
  const [serviceLevel, setServiceLevel] = useState<ServiceLevel | null>(null);
  const [cardCount, setCardCount] = useState(1);
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

  const regionPrices = servicePrices
    .filter((p) => p.region === region && p.isActive)
    .sort((a, b) => a.pricePerCard - b.pricePerCard);
  const selectedPrice = regionPrices.find((p) => p.serviceLevel === serviceLevel) ?? null;
  const psaFeeTotal = selectedPrice ? selectedPrice.pricePerCard * cardCount : 0;
  const taxAmount = Math.floor(psaFeeTotal * 0.1);
  const prepaidAmount = psaFeeTotal + taxAmount;

  async function handleSubmit() {
    if (!serviceLevel) {
      setError("サービスレベルを選択してください");
      return;
    }
    if (!Number.isInteger(cardCount) || cardCount < 1) {
      setError("カード枚数を正しく入力してください");
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
        serviceLevel,
        cardCount,
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
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center space-y-4">
        <div className="text-4xl">✅</div>
        <h2 className="text-lg font-bold text-gray-900">先払いを受け付けました</h2>
        <p className="text-sm text-gray-600">
          次に、カードのお預け方法（店頭持込・郵送）と日時をご予約ください。
          お預かり後、スタッフがカード明細を確定し、差額（代理入力料金・送料・保険等）を別途ご案内します。
        </p>
        <div className="flex flex-col gap-3 pt-1">
          {createdId && (
            <button
              onClick={() => router.push(`/mypage/submission-booking/${createdId}/edit`)}
              className="bg-brand-600 text-white font-bold px-6 py-3 rounded-lg hover:bg-brand-700 transition"
            >
              カード提出の予約へ進む
            </button>
          )}
          <button
            onClick={() => router.push("/mypage")}
            className={`font-bold px-6 py-3 rounded-lg transition ${
              createdId
                ? "border border-gray-300 text-gray-700 hover:bg-gray-50"
                : "bg-brand-600 text-white hover:bg-brand-700"
            }`}
          >
            マイページへ
          </button>
        </div>
      </div>
    );
  }

  if (step === "payment") {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-bold text-gray-900">概算のお支払い</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
          <div className="flex justify-between text-sm text-gray-700">
            <span>{SERVICE_LABELS[serviceLevel!]} × {cardCount}枚（鑑定料）</span>
            <span>{formatMoney(psaFeeTotal, region)}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-700">
            <span>消費税</span>
            <span>{formatMoney(taxAmount, region)}</span>
          </div>
          <div className="border-t border-gray-200 pt-3 flex justify-between font-bold text-gray-900">
            <span>先払い概算</span>
            <span>{formatMoney(prepaidAmount, region)}</span>
          </div>
          <p className="text-xs text-gray-500">
            代理入力料金・送料・保険料・事務手数料、および鑑定料の差額は、明細確定後に別途精算します。
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <StripeCardPayment
            clientSecret={clientSecret}
            publishableKey={stripePublishableKey}
            buttonLabel={`${formatMoney(prepaidAmount, region)} を支払う`}
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
      <h2 className="text-lg font-bold text-gray-900">代理申込の依頼（当社がカードを入力します）</h2>
      <p className="text-sm text-gray-600">
        サービスレベルと枚数を選び、概算（枚数×鑑定料＋税）を先払いします。お支払い後にカードのお預けをご予約ください。
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
                setServiceLevel(null);
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
        <h3 className="font-bold text-gray-800">サービスレベル</h3>
        {regionPrices.length > 0 ? (
          <div className="space-y-2">
            {regionPrices.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setServiceLevel(p.serviceLevel)}
                className={`w-full flex items-center justify-between rounded-xl border-2 p-4 text-left transition ${
                  serviceLevel === p.serviceLevel
                    ? "border-brand-500 bg-brand-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <span className="font-bold text-gray-900">{SERVICE_LABELS[p.serviceLevel]}</span>
                <span className="text-sm text-gray-700">{formatMoney(p.pricePerCard, region)} / 枚</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">このリージョンの料金が未設定です。</p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h3 className="font-bold text-gray-800">カード枚数</h3>
        <input
          type="number"
          min={1}
          max={500}
          value={cardCount}
          onChange={(e) => setCardCount(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
          className="w-32 rounded-lg border border-gray-300 px-3 py-3 text-sm focus:border-brand-500 focus:outline-none"
        />
        {selectedPrice && (
          <div className="rounded-lg bg-gray-50 p-4 space-y-1 text-sm">
            <div className="flex justify-between text-gray-700">
              <span>鑑定料（{cardCount}枚）</span>
              <span>{formatMoney(psaFeeTotal, region)}</span>
            </div>
            <div className="flex justify-between text-gray-700">
              <span>消費税</span>
              <span>{formatMoney(taxAmount, region)}</span>
            </div>
            <div className="flex justify-between font-bold text-gray-900 pt-1 border-t border-gray-200">
              <span>先払い概算</span>
              <span>{formatMoney(prepaidAmount, region)}</span>
            </div>
            <p className="text-xs text-gray-500 pt-1">
              代理入力料金・送料・保険料・事務手数料はカード明細の確定後に別途精算します。
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
