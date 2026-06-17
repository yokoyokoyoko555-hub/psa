"use client";

declare global {
  interface Window {
    Stripe?: (key: string) => {
      confirmCardPayment: (secret: string, opts: object) => Promise<{ error?: { message?: string } }>;
    };
  }
}

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createApplication } from "@/actions/application";
import { CardLanguage, ServiceLevel, ReturnMethod } from "@prisma/client";
import type { ServicePrice, ShippingRule, InsuranceRule } from "@prisma/client";

interface CardInput {
  tcgTitle: string;
  cardName: string;
  cardNumber: string;
  rarity: string;
  language: CardLanguage;
  declaredValue: number;
  quantity: number;
  frontImageKey: string;
  backImageKey: string;
  damageImageKeys: string[];
  notes: string;
  // client-side temp IDs for S3 upload (not sent to server directly)
  _tempId: string;
  _frontUploading: boolean;
  _backUploading: boolean;
}

const LANGUAGE_LABELS: Record<CardLanguage, string> = {
  JAPANESE: "日本語",
  ENGLISH: "英語",
  KOREAN: "韓国語",
  CHINESE: "中国語",
  OTHER: "その他",
};

const SERVICE_LABELS: Record<ServiceLevel, string> = {
  VALUE: "Value",
  REGULAR: "Regular",
  EXPRESS: "Express",
  SUPER_EXPRESS: "Super Express",
};

const TAX_RATE = 0.1;
const AGREEMENT_TEXT = `PSA鑑定受付代行サービス利用規約

1. 本サービスはカードのPSA鑑定を代行するサービスです。
2. お申込み後のキャンセルはお受けできません。
3. PSAからUpchargeが発生した場合、登録済みのカードへ追加請求を行います。
4. 鑑定中の紛失・破損は保険適用範囲内で対応します。
5. PSAグレードの結果に関して当社は責任を負いません。
6. 個人情報は鑑定業務にのみ使用します。
7. カードの郵送時の事故については責任を負いかねます。`;

const AGREEMENT_VERSION = "v1.0";

function newCard(): CardInput {
  return {
    tcgTitle: "",
    cardName: "",
    cardNumber: "",
    rarity: "",
    language: "JAPANESE",
    declaredValue: 0,
    quantity: 1,
    frontImageKey: "",
    backImageKey: "",
    damageImageKeys: [],
    notes: "",
    _tempId: crypto.randomUUID(),
    _frontUploading: false,
    _backUploading: false,
  };
}

type Props = {
  customerId: string;
  stripePublishableKey: string;
  servicePrices: ServicePrice[];
  shippingRules: ShippingRule[];
  insuranceRules: InsuranceRule[];
};

async function uploadToS3(
  file: File,
  tempId: string,
  type: "front" | "back" | "damage"
): Promise<string> {
  const contentType = file.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  const res = await fetch("/api/s3/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tempId, type, contentType }),
  });
  if (!res.ok) throw new Error("プリサイン取得失敗");
  const { uploadUrl, key } = await res.json();

  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file,
  });
  if (!put.ok) throw new Error("S3アップロード失敗");
  return key;
}

export default function ApplyForm({
  servicePrices,
  shippingRules,
  insuranceRules,
  stripePublishableKey,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState<"cards" | "service" | "confirm" | "payment">("cards");
  const [cards, setCards] = useState<CardInput[]>([newCard()]);
  const [serviceLevel, setServiceLevel] = useState<ServiceLevel>("REGULAR");
  const [returnMethod, setReturnMethod] = useState<ReturnMethod>("SHIPPING");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [paymentLoading, setPaymentLoading] = useState(false);
  const cardRefs = useRef<HTMLInputElement[]>([]);

  const addCard = () => setCards((prev) => [...prev, newCard()]);
  const removeCard = (i: number) => setCards((prev) => prev.filter((_, idx) => idx !== i));

  const updateCard = useCallback(
    <K extends keyof CardInput>(i: number, field: K, value: CardInput[K]) => {
      setCards((prev) => prev.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)));
    },
    []
  );

  async function handleImageUpload(
    i: number,
    type: "front" | "back",
    file: File
  ) {
    updateCard(i, type === "front" ? "_frontUploading" : "_backUploading", true);
    try {
      const key = await uploadToS3(file, cards[i]._tempId, type);
      updateCard(i, type === "front" ? "frontImageKey" : "backImageKey", key);
    } catch {
      setError(`画像アップロードに失敗しました（${type}）`);
    } finally {
      updateCard(i, type === "front" ? "_frontUploading" : "_backUploading", false);
    }
  }

  const totalDeclaredValue = cards.reduce((s, c) => s + c.declaredValue * c.quantity, 0);
  const cardCount = cards.reduce((s, c) => s + c.quantity, 0);

  const servicePrice = servicePrices.find((p) => p.serviceLevel === serviceLevel);
  const psaFeeTotal = (servicePrice?.pricePerCard ?? 0) * cardCount;
  const agencyFeeTotal = (servicePrice?.agencyFee ?? 0) * cardCount;

  const shippingRule =
    shippingRules.find((r) => {
      if (r.returnMethod !== returnMethod) return false;
      const over = totalDeclaredValue >= r.minAmount;
      const under = r.maxAmount === null || totalDeclaredValue <= r.maxAmount;
      return over && under;
    }) ?? shippingRules.filter((r) => r.returnMethod === returnMethod).at(-1);
  const shippingFee = shippingRule?.fee ?? 0;

  const insuranceRule =
    insuranceRules.find((r) => {
      const over = totalDeclaredValue >= r.minValue;
      const under = r.maxValue === null || totalDeclaredValue <= r.maxValue;
      return over && under;
    }) ?? insuranceRules.at(-1);
  const insuranceFee = insuranceRule?.feeRate
    ? Math.ceil(totalDeclaredValue * (insuranceRule.feeRate / 100))
    : (insuranceRule?.fee ?? 0);

  const subtotal = psaFeeTotal + agencyFeeTotal + shippingFee + insuranceFee;
  const taxAmount = Math.floor(subtotal * TAX_RATE);
  const totalAmount = subtotal + taxAmount;

  async function handleSubmit() {
    if (!agreed) {
      setError("利用規約に同意してください");
      return;
    }
    setLoading(true);
    setError("");

    const result = await createApplication({
      serviceLevel,
      returnMethod,
      cards: cards.map((c) => ({
        tcgTitle: c.tcgTitle,
        cardName: c.cardName,
        cardNumber: c.cardNumber || undefined,
        rarity: c.rarity || undefined,
        language: c.language,
        declaredValue: c.declaredValue,
        quantity: c.quantity,
        frontImageKey: c.frontImageKey || undefined,
        backImageKey: c.backImageKey || undefined,
        damageImageKeys: c.damageImageKeys,
        notes: c.notes || undefined,
      })),
      agreementText: AGREEMENT_TEXT,
      agreementVersion: AGREEMENT_VERSION,
      ipAddress: "client",
      userAgent: navigator.userAgent,
    });

    if (result.success && result.clientSecret) {
      setClientSecret(result.clientSecret);
      setStep("payment");
    } else {
      setError(result.error ?? "エラーが発生しました");
    }
    setLoading(false);
  }

  async function handlePayment() {
    if (!clientSecret) return;
    setPaymentLoading(true);
    setError("");

    // Dynamically load Stripe.js from CDN
    if (!window.Stripe) {
      const script = document.createElement("script");
      script.src = "https://js.stripe.com/v3/";
      await new Promise<void>((resolve) => { script.onload = () => resolve(); document.head.appendChild(script); });
    }
    const stripe = window.Stripe?.(stripePublishableKey) as {
      confirmCardPayment: (secret: string, opts: object) => Promise<{ error?: { message?: string } }>;
    } | null;
    if (!stripe) {
      setError("Stripeの初期化に失敗しました");
      setPaymentLoading(false);
      return;
    }

    const cardNumberEl = document.getElementById("stripe-card-number") as HTMLInputElement | null;
    if (!cardNumberEl) {
      setError("カード番号を入力してください");
      setPaymentLoading(false);
      return;
    }

    // For production: use stripe.confirmCardPayment with Elements
    // This is a simplified placeholder that shows the flow
    const { error: stripeError } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: {
        card: { token: "tok_visa" },
        billing_details: { name: "Customer" },
      },
    });

    if (stripeError) {
      setError(stripeError.message ?? "決済エラーが発生しました");
      setPaymentLoading(false);
    } else {
      router.push("/mypage?payment=success");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs text-gray-500">トレカビンクス PSA申込</p>
          <h1 className="font-bold text-gray-900">PSA鑑定申込</h1>
        </div>
      </header>

      {/* Progress */}
      <div className="bg-white border-b border-gray-100 px-4 py-3">
        <div className="max-w-3xl mx-auto flex gap-4">
          {(["cards", "service", "confirm", "payment"] as const).map((s, i) => {
            const labels = ["カード情報", "サービス", "確認・同意", "お支払い"];
            const currentIdx = ["cards", "service", "confirm", "payment"].indexOf(step);
            return (
              <div
                key={s}
                className={`flex items-center gap-2 text-sm ${
                  step === s
                    ? "text-blue-600 font-bold"
                    : i < currentIdx
                    ? "text-green-600"
                    : "text-gray-400"
                }`}
              >
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    i < currentIdx
                      ? "bg-green-500 text-white"
                      : step === s
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {i < currentIdx ? "✓" : i + 1}
                </span>
                <span className="hidden sm:inline">{labels[i]}</span>
              </div>
            );
          })}
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-6 text-sm">
            {error}
          </div>
        )}

        {/* STEP 1: Cards */}
        {step === "cards" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">カード情報入力</h2>
              <button
                onClick={addCard}
                className="bg-blue-50 text-blue-600 font-medium px-4 py-2 rounded-lg text-sm hover:bg-blue-100 transition"
              >
                ＋ カードを追加
              </button>
            </div>

            {cards.map((card, i) => (
              <div key={card._tempId} className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-800">カード {i + 1}</h3>
                  {cards.length > 1 && (
                    <button
                      onClick={() => removeCard(i)}
                      className="text-red-500 text-sm hover:text-red-700"
                    >
                      削除
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      TCGタイトル <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={card.tcgTitle}
                      onChange={(e) => updateCard(i, "tcgTitle", e.target.value)}
                      placeholder="例: ポケモンカードゲーム"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      カード名 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={card.cardName}
                      onChange={(e) => updateCard(i, "cardName", e.target.value)}
                      placeholder="例: リザードン"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">型番</label>
                    <input
                      type="text"
                      value={card.cardNumber}
                      onChange={(e) => updateCard(i, "cardNumber", e.target.value)}
                      placeholder="例: 003/102"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">レアリティ</label>
                    <input
                      type="text"
                      value={card.rarity}
                      onChange={(e) => updateCard(i, "rarity", e.target.value)}
                      placeholder="例: ☆☆☆"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      言語 <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={card.language}
                      onChange={(e) => updateCard(i, "language", e.target.value as CardLanguage)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {(Object.entries(LANGUAGE_LABELS) as [CardLanguage, string][]).map(
                        ([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      申告価格（円） <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={card.declaredValue || ""}
                      onChange={(e) =>
                        updateCard(i, "declaredValue", parseInt(e.target.value) || 0)
                      }
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      枚数 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={card.quantity}
                      onChange={(e) =>
                        updateCard(i, "quantity", parseInt(e.target.value) || 1)
                      }
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Image uploads */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      表面画像
                    </label>
                    <div className="relative">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={card._frontUploading}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleImageUpload(i, "front", file);
                        }}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-blue-50 file:text-blue-600"
                      />
                      {card._frontUploading && (
                        <span className="absolute right-3 top-2 text-xs text-gray-400">
                          アップロード中...
                        </span>
                      )}
                    </div>
                    {card.frontImageKey && (
                      <p className="text-xs text-green-600 mt-1">✓ アップロード済み</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      裏面画像
                    </label>
                    <div className="relative">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={card._backUploading}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleImageUpload(i, "back", file);
                        }}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-blue-50 file:text-blue-600"
                      />
                      {card._backUploading && (
                        <span className="absolute right-3 top-2 text-xs text-gray-400">
                          アップロード中...
                        </span>
                      )}
                    </div>
                    {card.backImageKey && (
                      <p className="text-xs text-green-600 mt-1">✓ アップロード済み</p>
                    )}
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">備考</label>
                    <textarea
                      value={card.notes}
                      onChange={(e) => updateCard(i, "notes", e.target.value)}
                      rows={2}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            ))}

            <button
              onClick={() => {
                if (
                  cards.some(
                    (c) => !c.tcgTitle || !c.cardName || c.declaredValue <= 0
                  )
                ) {
                  setError(
                    "必須項目を入力してください（TCGタイトル、カード名、申告価格）"
                  );
                  return;
                }
                if (cards.some((c) => c._frontUploading || c._backUploading)) {
                  setError("画像のアップロードが完了するまでお待ちください");
                  return;
                }
                setError("");
                setStep("service");
              }}
              className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition"
            >
              次へ：サービス選択
            </button>
          </div>
        )}

        {/* STEP 2: Service */}
        {step === "service" && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-gray-900">サービス・返却方法の選択</h2>

            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              <h3 className="font-bold text-gray-800">サービスレベル</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {servicePrices.map((sp) => (
                  <button
                    key={sp.serviceLevel}
                    onClick={() => setServiceLevel(sp.serviceLevel)}
                    className={`border-2 rounded-xl p-4 text-left transition ${
                      serviceLevel === sp.serviceLevel
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <p className="font-bold text-gray-900">{SERVICE_LABELS[sp.serviceLevel]}</p>
                    <p className="text-blue-600 font-medium">
                      ¥{sp.pricePerCard.toLocaleString()}/枚
                    </p>
                    <p className="text-xs text-gray-500">
                      代行手数料 ¥{sp.agencyFee.toLocaleString()}/枚
                    </p>
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
                    className={`border-2 rounded-xl p-4 text-left transition ${
                      returnMethod === m
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <p className="text-2xl mb-1">{m === "STORE_PICKUP" ? "🏪" : "📦"}</p>
                    <p className="font-bold text-gray-900">
                      {m === "STORE_PICKUP" ? "店頭受取" : "配送"}
                    </p>
                    {m === "STORE_PICKUP" && (
                      <p className="text-xs text-green-600 mt-1">無料</p>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Estimate */}
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-6">
              <h3 className="font-bold text-blue-900 mb-3">お見積もり（税込）</h3>
              <div className="space-y-1 text-sm text-blue-800">
                <div className="flex justify-between">
                  <span>PSA鑑定料（{cardCount}枚）</span>
                  <span>¥{psaFeeTotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>代行手数料</span>
                  <span>¥{agencyFeeTotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>送料</span>
                  <span>¥{shippingFee.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>保険料（申告総額 ¥{totalDeclaredValue.toLocaleString()}）</span>
                  <span>¥{insuranceFee.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>消費税（10%）</span>
                  <span>¥{taxAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-bold text-blue-900 border-t border-blue-300 pt-2 mt-2 text-base">
                  <span>お支払い合計</span>
                  <span>¥{totalAmount.toLocaleString()}</span>
                </div>
              </div>
              <p className="text-xs text-blue-500 mt-2">
                ※ Upchargeが発生した場合は別途ご請求します
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep("cards")}
                className="flex-1 border border-gray-300 text-gray-700 font-bold py-3 rounded-xl hover:bg-gray-50 transition"
              >
                戻る
              </button>
              <button
                onClick={() => setStep("confirm")}
                className="flex-1 bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition"
              >
                次へ：確認・同意
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Confirm */}
        {step === "confirm" && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-gray-900">申込内容の確認と同意</h2>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-bold text-gray-800 mb-2">申込カード一覧</h3>
              <div className="space-y-2">
                {cards.map((c, i) => (
                  <div key={c._tempId} className="flex justify-between text-sm text-gray-700 py-1 border-b border-gray-100">
                    <span>
                      {i + 1}. {c.cardName}（{c.tcgTitle}）× {c.quantity}枚
                    </span>
                    <span className="text-gray-500">申告 ¥{(c.declaredValue * c.quantity).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-sm text-gray-600">
                <span className="font-medium">サービス:</span>{" "}
                {SERVICE_LABELS[serviceLevel]} /{" "}
                <span className="font-medium">返却:</span>{" "}
                {returnMethod === "STORE_PICKUP" ? "店頭受取" : "配送"}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-bold text-gray-800 mb-3">利用規約</h3>
              <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600 whitespace-pre-line h-48 overflow-y-auto border border-gray-200">
                {AGREEMENT_TEXT}
              </div>
              <label className="flex items-start gap-3 mt-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-1 w-4 h-4"
                />
                <span className="text-sm text-gray-700">
                  上記利用規約を読み、内容に同意します
                </span>
              </label>
            </div>

            <div className="bg-blue-50 rounded-xl border border-blue-200 p-6">
              <div className="flex justify-between items-center">
                <span className="font-bold text-blue-900">お支払い合計</span>
                <span className="text-2xl font-bold text-blue-900">
                  ¥{totalAmount.toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-blue-500 mt-1">（税込）</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep("service")}
                className="flex-1 border border-gray-300 text-gray-700 font-bold py-3 rounded-xl hover:bg-gray-50 transition"
              >
                戻る
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading || !agreed}
                className="flex-1 bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {loading ? "処理中..." : "申込を確定して決済へ"}
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Payment */}
        {step === "payment" && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-gray-900">お支払い</h2>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-6">
                <span className="font-bold text-gray-900">お支払い金額</span>
                <span className="text-2xl font-bold text-gray-900">
                  ¥{totalAmount.toLocaleString()}
                </span>
              </div>

              {/* Stripe Elements placeholder */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    カード番号
                  </label>
                  <div className="border border-gray-300 rounded-lg px-3 py-3 bg-gray-50 text-sm text-gray-400">
                    Stripe Elements がここに表示されます
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">有効期限</label>
                    <div className="border border-gray-300 rounded-lg px-3 py-3 bg-gray-50 text-sm text-gray-400">
                      MM / YY
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">セキュリティコード</label>
                    <div className="border border-gray-300 rounded-lg px-3 py-3 bg-gray-50 text-sm text-gray-400">
                      CVC
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-gray-500 mt-2">
                  <span>🔒</span>
                  <span>決済情報はStripeによって安全に処理されます。カード情報は当社に送信されません。</span>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-800">
                  ※ Stripe Elements を統合するには <code>@stripe/react-stripe-js</code> と <code>@stripe/stripe-js</code> パッケージをインストールし、<code>Elements</code> プロバイダーを設定してください。
                  clientSecret: <code className="break-all">{clientSecret.slice(0, 30)}...</code>
                </div>
              </div>

              <button
                onClick={handlePayment}
                disabled={paymentLoading}
                className="w-full mt-6 bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {paymentLoading ? "決済処理中..." : `¥${totalAmount.toLocaleString()} を支払う`}
              </button>
            </div>

            <p className="text-xs text-gray-400 text-center">
              カード情報はStripeのサーバーで安全に処理されます
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
