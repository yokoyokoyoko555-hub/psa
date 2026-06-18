"use client";

declare global {
  interface Window {
    Stripe?: (key: string) => {
      confirmCardPayment: (secret: string, opts: object) => Promise<{ error?: { message?: string } }>;
    };
  }
}

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createApplication } from "@/actions/application";
import { ServiceLevel, ServiceRegion, ReturnMethod } from "@prisma/client";
import type { ServicePrice, ShippingRule, InsuranceRule } from "@prisma/client";

const SERVICE_LABELS: Record<ServiceLevel, string> = {
  VALUE: "バリュー",
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

const REGION_LABELS: Record<ServiceRegion, string> = {
  PSA_JP: "PSA 日本",
  PSA_US: "PSA US",
};

const TAX_RATE = 0.1;
const AGREEMENT_VERSION = "v1.0";
const AGREEMENT_TEXT = `PSA鑑定受付代行サービス利用規約

1. 本サービスはカードのPSA鑑定を代行するサービスです。
2. お申込み後のキャンセルはお受けできません。
3. PSAからUpchargeが発生した場合、登録済みのカードへ追加請求を行います。
4. 鑑定中の紛失・破損は保険適用範囲内で対応します。
5. PSAグレードの結果に関して当社は責任を負いません。
6. 個人情報は鑑定業務にのみ使用します。
7. カードの郵送時の事故については責任を負いかねます。`;

interface CardItem {
  tcgTitle: string;
  releaseYear: string; // 入力は文字列、送信時に数値化
  cardNumber: string;
  cardName: string;
  rarity: string;
  quantity: number;
  declaredValue: number;
}

function emptyCard(): CardItem {
  return {
    tcgTitle: "",
    releaseYear: "",
    cardNumber: "",
    cardName: "",
    rarity: "",
    quantity: 1,
    declaredValue: 0,
  };
}

type Props = {
  customerId: string;
  stripePublishableKey: string;
  servicePrices: ServicePrice[];
  shippingRules: ShippingRule[];
  insuranceRules: InsuranceRule[];
};

const STEPS = [
  { key: "service", label: "サービス選択" },
  { key: "cards", label: "カード情報" },
  { key: "confirm", label: "確認・同意" },
  { key: "payment", label: "お支払い" },
] as const;
type StepKey = (typeof STEPS)[number]["key"];

export default function ApplyForm({
  servicePrices,
  shippingRules,
  insuranceRules,
  stripePublishableKey,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState<StepKey>("service");

  const [region, setRegion] = useState<ServiceRegion>("PSA_JP");
  const [serviceLevel, setServiceLevel] = useState<ServiceLevel | null>(null);
  const [returnMethod, setReturnMethod] = useState<ReturnMethod>("SHIPPING");

  const [cards, setCards] = useState<CardItem[]>([]);
  const [draft, setDraft] = useState<CardItem>(emptyCard());
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [paymentLoading, setPaymentLoading] = useState(false);

  const regionPrices = servicePrices.filter((p) => p.region === region);
  const servicePrice = regionPrices.find((p) => p.serviceLevel === serviceLevel);
  const cap = servicePrice?.maxDeclaredValue ?? null;

  function setDraftField<K extends keyof CardItem>(field: K, value: CardItem[K]) {
    setDraft((d) => ({ ...d, [field]: value }));
  }

  function clearDraft() {
    setDraft(emptyCard());
    setEditingIndex(null);
    setError("");
  }

  function saveDraft() {
    setError("");
    if (!draft.tcgTitle.trim() || !draft.cardName.trim()) {
      setError("タイトルとカード名は必須です");
      return;
    }
    if (draft.declaredValue < 1) {
      setError("申告金額を入力してください");
      return;
    }
    if (cap !== null && draft.declaredValue > cap) {
      setError(
        `申告金額が選択中のサービス上限（¥${cap.toLocaleString()}）を超えています。上位サービスを選択してください。`
      );
      return;
    }
    if (draft.quantity < 1) {
      setError("枚数は1以上で入力してください");
      return;
    }

    if (editingIndex !== null) {
      setCards((prev) => prev.map((c, i) => (i === editingIndex ? draft : c)));
    } else {
      setCards((prev) => [...prev, draft]);
    }
    clearDraft();
  }

  function editCard(i: number) {
    setDraft(cards[i]);
    setEditingIndex(i);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function deleteCard(i: number) {
    setCards((prev) => prev.filter((_, idx) => idx !== i));
    if (editingIndex === i) clearDraft();
  }

  const cardCount = cards.reduce((s, c) => s + c.quantity, 0);
  const totalDeclaredValue = cards.reduce((s, c) => s + c.declaredValue * c.quantity, 0);
  const psaFeeTotal = (servicePrice?.pricePerCard ?? 0) * cardCount;
  const agencyFeeTotal = 0; // 顧客入力は手数料なし

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
    if (!serviceLevel) {
      setError("サービスを選択してください");
      return;
    }
    setLoading(true);
    setError("");

    const result = await createApplication({
      serviceLevel,
      region,
      returnMethod,
      cards: cards.map((c) => ({
        tcgTitle: c.tcgTitle,
        releaseYear: c.releaseYear ? parseInt(c.releaseYear) : undefined,
        cardName: c.cardName,
        cardNumber: c.cardNumber || undefined,
        rarity: c.rarity || undefined,
        language: "JAPANESE" as const,
        declaredValue: c.declaredValue,
        quantity: c.quantity,
        damageImageKeys: [],
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
    if (!window.Stripe) {
      const script = document.createElement("script");
      script.src = "https://js.stripe.com/v3/";
      await new Promise<void>((resolve) => {
        script.onload = () => resolve();
        document.head.appendChild(script);
      });
    }
    const stripe = window.Stripe?.(stripePublishableKey) as {
      confirmCardPayment: (secret: string, opts: object) => Promise<{ error?: { message?: string } }>;
    } | null;
    if (!stripe) {
      setError("Stripeの初期化に失敗しました");
      setPaymentLoading(false);
      return;
    }
    const { error: stripeError } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: { card: { token: "tok_visa" }, billing_details: { name: "Customer" } },
    });
    if (stripeError) {
      setError(stripeError.message ?? "決済エラーが発生しました");
      setPaymentLoading(false);
    } else {
      router.push("/mypage?payment=success");
    }
  }

  const currentIdx = STEPS.findIndex((s) => s.key === step);

  const inputCls =
    "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500";

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs text-gray-500">トレカビンクス PSA申込</p>
          <h1 className="font-bold text-gray-900">PSA鑑定申込</h1>
        </div>
      </header>

      {/* Stepper */}
      <div className="max-w-3xl mx-auto px-4 py-4">
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  i <= currentIdx ? "bg-brand-600 text-white" : "bg-gray-200 text-gray-500"
                }`}
              >
                {i + 1}
              </div>
              <span className={`text-sm ${i === currentIdx ? "font-bold text-brand-700" : "text-gray-500"}`}>
                {s.label}
              </span>
              {i < STEPS.length - 1 && <span className="text-gray-300 mx-1">›</span>}
            </div>
          ))}
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 pb-16">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm mb-4">
            {error}
          </div>
        )}

        {/* STEP 1: Service */}
        {step === "service" && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              <h2 className="font-bold text-gray-800">鑑定提出先</h2>
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
              <h2 className="font-bold text-gray-800">サービスレベル</h2>
              <p className="text-xs text-gray-500">
                申告金額の上限に応じてサービスを選んでください。選択後にカードを入力します。
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {regionPrices.map((sp) => (
                  <button
                    key={sp.id}
                    onClick={() => setServiceLevel(sp.serviceLevel)}
                    className={`border-2 rounded-xl p-4 text-left transition ${
                      serviceLevel === sp.serviceLevel
                        ? "border-brand-500 bg-brand-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <p className="font-bold text-gray-900">{SERVICE_LABELS[sp.serviceLevel]}</p>
                    <p className="text-brand-600 font-medium">¥{sp.pricePerCard.toLocaleString()}/枚</p>
                    <p className="text-xs text-gray-500">
                      申告価格上限{" "}
                      {sp.maxDeclaredValue === null ? "なし" : `¥${sp.maxDeclaredValue.toLocaleString()}`}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              <h2 className="font-bold text-gray-800">返却方法</h2>
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

            <button
              onClick={() => {
                if (!serviceLevel) {
                  setError("サービスレベルを選択してください");
                  return;
                }
                setError("");
                setStep("cards");
              }}
              className="w-full bg-brand-600 text-white font-bold py-4 rounded-xl hover:bg-brand-700 transition"
            >
              カード情報の入力へ
            </button>
          </div>
        )}

        {/* STEP 2: Cards */}
        {step === "cards" && (
          <div className="space-y-6">
            <div className="bg-brand-50 border border-brand-200 rounded-xl p-4 text-sm text-brand-800">
              選択中: <strong>{REGION_LABELS[region]} / {serviceLevel && SERVICE_LABELS[serviceLevel]}</strong>
              {cap !== null && <>（申告金額上限 ¥{cap.toLocaleString()}/枚）</>}
            </div>

            {/* Card entry form */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              <h2 className="font-bold text-gray-800">
                {editingIndex !== null ? "カードを編集" : "カード情報を入力"}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">タイトル *</label>
                  <input
                    className={inputCls}
                    placeholder="例: ポケモンカードゲーム"
                    value={draft.tcgTitle}
                    onChange={(e) => setDraftField("tcgTitle", e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">発行年</label>
                  <input
                    type="number"
                    className={inputCls}
                    placeholder="例: 2022"
                    value={draft.releaseYear}
                    onChange={(e) => setDraftField("releaseYear", e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">カード番号</label>
                  <input
                    className={inputCls}
                    placeholder="例: 003/102"
                    value={draft.cardNumber}
                    onChange={(e) => setDraftField("cardNumber", e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">カード名 *</label>
                  <input
                    className={inputCls}
                    placeholder="例: リザードン"
                    value={draft.cardName}
                    onChange={(e) => setDraftField("cardName", e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">レアリティ</label>
                  <input
                    className={inputCls}
                    placeholder="例: SR"
                    value={draft.rarity}
                    onChange={(e) => setDraftField("rarity", e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">枚数 *</label>
                  <input
                    type="number"
                    min={1}
                    className={inputCls}
                    value={draft.quantity || ""}
                    onChange={(e) => setDraftField("quantity", parseInt(e.target.value) || 1)}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">申告金額（円） *</label>
                  <input
                    type="number"
                    min={1}
                    className={inputCls}
                    placeholder="例: 50000"
                    value={draft.declaredValue || ""}
                    onChange={(e) => setDraftField("declaredValue", parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={saveDraft}
                  className="bg-brand-600 text-white font-bold px-6 py-2 rounded-lg hover:bg-brand-700 transition"
                >
                  {editingIndex !== null ? "更新" : "保存"}
                </button>
                <button
                  onClick={clearDraft}
                  className="border border-gray-300 text-gray-600 px-6 py-2 rounded-lg hover:bg-gray-50 transition"
                >
                  消去
                </button>
              </div>
            </div>

            {/* Saved cards list */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-gray-800">アイテム（{cards.length}）</h3>
                <span className="text-sm text-gray-500">
                  申告合計 ¥{totalDeclaredValue.toLocaleString()}
                </span>
              </div>
              {cards.length === 0 ? (
                <p className="px-4 py-8 text-center text-gray-400 text-sm">
                  上のフォームからカードを追加してください
                </p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {cards.map((c, i) => (
                    <div key={i} className="px-4 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">
                          {c.releaseYear ? `${c.releaseYear} ` : ""}
                          {c.tcgTitle} {c.cardNumber} {c.cardName}
                          {c.rarity ? `（${c.rarity}）` : ""}
                        </p>
                        <p className="text-xs text-gray-400">
                          {c.quantity}枚 / 申告 ¥{(c.declaredValue * c.quantity).toLocaleString()}
                        </p>
                      </div>
                      <button
                        onClick={() => editCard(i)}
                        className="text-brand-600 hover:text-brand-800 text-sm font-medium"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => deleteCard(i)}
                        className="text-red-500 hover:text-red-700 text-sm font-medium"
                      >
                        削除
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep("service")}
                className="border border-gray-300 text-gray-600 px-6 py-3 rounded-xl hover:bg-gray-50 transition"
              >
                戻る
              </button>
              <button
                onClick={() => {
                  if (cards.length === 0) {
                    setError("カードを1枚以上追加してください");
                    return;
                  }
                  setError("");
                  setStep("confirm");
                }}
                className="flex-1 bg-brand-600 text-white font-bold py-3 rounded-xl hover:bg-brand-700 transition"
              >
                確認へ進む
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Confirm */}
        {step === "confirm" && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-bold text-gray-900 mb-3">申込内容の確認</h2>
              <div className="text-sm text-gray-600 mb-3">
                <span className="font-medium">提出先:</span> {REGION_LABELS[region]} /{" "}
                <span className="font-medium">サービス:</span>{" "}
                {serviceLevel && SERVICE_LABELS[serviceLevel]} /{" "}
                <span className="font-medium">返却:</span>{" "}
                {returnMethod === "STORE_PICKUP" ? "店頭受取" : "配送"}
              </div>
              <div className="divide-y divide-gray-100">
                {cards.map((c, i) => (
                  <div key={i} className="flex justify-between text-sm text-gray-700 py-1">
                    <span>
                      {i + 1}. {c.releaseYear ? `${c.releaseYear} ` : ""}
                      {c.cardName}（{c.tcgTitle}）× {c.quantity}枚
                    </span>
                    <span className="text-gray-500">
                      申告 ¥{(c.declaredValue * c.quantity).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">鑑定料</span><span>¥{psaFeeTotal.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">送料</span><span>¥{shippingFee.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">保険料</span><span>¥{insuranceFee.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">消費税</span><span>¥{taxAmount.toLocaleString()}</span></div>
              <div className="flex justify-between font-bold text-gray-900 border-t border-gray-100 pt-2 mt-2">
                <span>合計</span><span>¥{totalAmount.toLocaleString()}</span>
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

            <div className="flex gap-3">
              <button
                onClick={() => setStep("cards")}
                className="border border-gray-300 text-gray-600 px-6 py-3 rounded-xl hover:bg-gray-50 transition"
              >
                戻る
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 bg-brand-600 text-white font-bold py-3 rounded-xl hover:bg-brand-700 disabled:opacity-50 transition"
              >
                {loading ? "処理中..." : "申込を確定して決済へ"}
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Payment (placeholder) */}
        {step === "payment" && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              <h2 className="font-bold text-gray-900">お支払い</h2>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
                ※ 決済機能（Stripe Elements）は統合準備中です。clientSecret:{" "}
                <code className="break-all">{clientSecret.slice(0, 24)}...</code>
              </div>
              <button
                onClick={handlePayment}
                disabled={paymentLoading}
                className="w-full bg-brand-600 text-white font-bold py-3 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition"
              >
                {paymentLoading ? "決済処理中..." : `¥${totalAmount.toLocaleString()} を支払う`}
              </button>
              <p className="text-xs text-gray-400 text-center">
                カード情報はStripeのサーバーで安全に処理されます。
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
