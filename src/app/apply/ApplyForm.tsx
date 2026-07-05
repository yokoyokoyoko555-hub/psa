"use client";

declare global {
  interface Window {
    Stripe?: (key: string) => StripeClient;
  }
}

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { confirmApplicationPayment, createApplication, previewFees, saveDraft as saveDraftServer } from "@/actions/application";
import type { FeeBreakdown } from "@/lib/fee-calculator";
import { formatMoney } from "@/lib/currency";

export type InitialDraft = {
  draftId: string;
  serviceLevel: ServiceLevel;
  region: ServiceRegion;
  itemType: ItemType;
  returnMethod: ReturnMethod;
  cards: {
    tcgTitle: string;
    releaseYear: string;
    cardNumber: string;
    cardName: string;
    rarity: string;
    language?: string;
    quantity: number;
    declaredValue: number;
    autographRequested?: boolean;
  }[];
  returnSel: string;
};

const DRAFT_KEY = "psa-apply-draft";
import { ServiceLevel, ServiceRegion, ItemType, ReturnMethod } from "@prisma/client";
import type { ServicePrice, ShippingRule, InsuranceRule, AutographPricing } from "@prisma/client";

const LANGUAGE_SUGGESTIONS = ["日本語", "英語", "韓国語", "中国語", "その他"];
import type { CustomerProfile } from "@/actions/customer";
import type { Address } from "@/actions/address";
import AddressManager from "../mypage/addresses/AddressManager";

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
  PACK_VALUE: "バリュー",
  PACK_ECONOMY: "エコノミー",
  PACK_EXPRESS: "エクスプレス",
  COMIC_MODERN: "モダン",
  COMIC_MODERN_PLUS: "モダンプラス",
  COMIC_VINTAGE: "ビンテージ",
  COMIC_VINTAGE_PLUS: "ビンテージプラス",
  COMIC_HIGH_VALUE: "ハイバリュー",
  COMIC_EXPRESS: "エクスプレス",
  COMIC_SUPER_EXPRESS: "スーパーエクスプレス",
  COMIC_WALK_THROUGH: "ウォークスルー",
};

const REGION_LABELS: Record<ServiceRegion, string> = {
  PSA_JP: "PSA 日本",
  PSA_US: "PSA US",
};

const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  TRADING_CARD: "トレーディングカード",
  UNOPENED_PACK: "未開封パック",
  COMIC_MAGAZINE: "コミック・マガジン",
};

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
  language: string;
  quantity: number;
  declaredValue: number;
  autographRequested: boolean;
}

function emptyCard(): CardItem {
  return {
    tcgTitle: "",
    releaseYear: "",
    cardNumber: "",
    cardName: "",
    rarity: "",
    language: "日本語",
    quantity: 1,
    declaredValue: 0,
    autographRequested: false,
  };
}

type Props = {
  customerId: string;
  stripePublishableKey: string;
  servicePrices: ServicePrice[];
  shippingRules: ShippingRule[];
  insuranceRules: InsuranceRule[];
  autographPricing: AutographPricing[];
  profile: CustomerProfile | null;
  addresses: Address[];
  initialDraft?: InitialDraft | null;
};

const STEPS = [
  { key: "service", label: "サービス選択" },
  { key: "cards", label: "カード情報" },
  { key: "shipping", label: "発送先" },
  { key: "confirm", label: "確認・同意" },
  { key: "payment", label: "お支払い" },
] as const;
type StepKey = (typeof STEPS)[number]["key"];

type StripeCardElement = {
  mount: (selector: string | HTMLElement) => void;
  destroy: () => void;
  on: (event: "change", handler: (event: { error?: { message?: string } }) => void) => void;
};

type StripeElements = {
  create: (
    type: "card",
    options?: {
      style?: Record<string, Record<string, string | Record<string, string>>>;
      hidePostalCode?: boolean;
    }
  ) => StripeCardElement;
};

type StripeClient = {
  elements: (options?: { clientSecret?: string }) => StripeElements;
  confirmCardPayment: (
    secret: string,
    opts: { payment_method: { card: StripeCardElement; billing_details?: { name?: string } } }
  ) => Promise<{
    error?: { message?: string };
    paymentIntent?: { id: string; status: string };
  }>;
};

export default function ApplyForm({
  servicePrices,
  shippingRules,
  insuranceRules,
  autographPricing,
  stripePublishableKey,
  profile,
  addresses,
  initialDraft,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState<StepKey>(initialDraft ? "cards" : "service");
  const [maxStep, setMaxStep] = useState(initialDraft ? 1 : 0); // 到達済みの最大ステップindex
  const [draftId, setDraftId] = useState<string | null>(initialDraft?.draftId ?? null);

  const [region, setRegion] = useState<ServiceRegion>(initialDraft?.region ?? "PSA_JP");
  const [itemType, setItemType] = useState<ItemType>(initialDraft?.itemType ?? "TRADING_CARD");
  const [serviceLevel, setServiceLevel] = useState<ServiceLevel | null>(
    initialDraft?.serviceLevel ?? null
  );
  const [returnMethod, setReturnMethod] = useState<ReturnMethod>(
    initialDraft?.returnMethod ?? "SHIPPING"
  );

  const [cards, setCards] = useState<CardItem[]>(
    (initialDraft?.cards ?? []).map((c) => ({
      ...c,
      language: c.language ?? "日本語",
      autographRequested: c.autographRequested ?? false,
    }))
  );
  const [draft, setDraft] = useState<CardItem>(emptyCard());
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // 返送先住所（"registered"＝登録住所 / それ以外は住所帳のID）
  const [addrList, setAddrList] = useState<Address[]>(addresses);
  const [returnSel, setReturnSel] = useState<string>(
    initialDraft?.returnSel ?? addresses.find((a) => a.isDefault)?.id ?? "registered"
  );
  const selectedAddr = addrList.find((a) => a.id === returnSel);

  const [shippingPhone, setShippingPhone] = useState<string>(profile?.phone ?? "");

  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [createdApplicationId, setCreatedApplicationId] = useState("");
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [stripeReady, setStripeReady] = useState(false);
  const [cardError, setCardError] = useState("");
  const cardElementContainerRef = useRef<HTMLDivElement | null>(null);
  const stripeRef = useRef<StripeClient | null>(null);
  const cardElementRef = useRef<StripeCardElement | null>(null);

  const regionPrices = servicePrices.filter((p) => p.region === region && p.itemType === itemType);
  const servicePrice = regionPrices.find((p) => p.serviceLevel === serviceLevel);
  const cap = servicePrice?.maxDeclaredValue ?? null;

  // オートグラフ（デュアルサービス）: PSA_US×TRADING_CARDかつ選択中サービスレベルの価格が有効な場合のみ提示
  const isAutographEligible = region === "PSA_US" && itemType === "TRADING_CARD";
  const autographActive =
    isAutographEligible && autographPricing.some((a) => a.region === region && a.serviceLevel === serviceLevel && a.isActive);

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
        `申告金額が選択中のサービス上限（${formatMoney(cap, region)}）を超えています。上位サービスを選択してください。`
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
  const autographCount = cards.filter((c) => c.autographRequested).reduce((s, c) => s + c.quantity, 0);

  // 料金はサーバー(calculateFees)と同じ計算で取得し、請求額とプレビューを一致させる
  const [fees, setFees] = useState<FeeBreakdown | null>(null);
  useEffect(() => {
    let cancelled = false;
    previewFees({ serviceLevel, region, itemType, returnMethod, cardCount, totalDeclaredValue, autographCount }).then((f) => {
      if (!cancelled) setFees(f);
    });
    return () => {
      cancelled = true;
    };
  }, [serviceLevel, region, itemType, returnMethod, cardCount, totalDeclaredValue, autographCount]);

  const psaFeeTotal = fees?.psaFeeTotal ?? 0;
  const autographFeeTotal = fees?.autographFeeTotal ?? 0;
  const shippingInsuranceFee = (fees?.shippingFee ?? 0) + (fees?.insuranceFee ?? 0);
  const handlingFee = fees?.handlingFee ?? 0;
  const discountAmount = fees?.discountAmount ?? 0;
  const campaignName = fees?.campaignName ?? null;
  const taxAmount = fees?.taxAmount ?? 0;
  const totalAmount = fees?.totalAmount ?? 0;

  // 一時保存（localStorage）からの復元。意図的に effect 内で state を設定する。
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (initialDraft) return; // サーバー下書きを再開中はlocalStorage復元しない
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.region) setRegion(d.region);
      if (d.itemType) setItemType(d.itemType);
      if (d.serviceLevel) setServiceLevel(d.serviceLevel);
      if (d.returnMethod) setReturnMethod(d.returnMethod);
      if (Array.isArray(d.cards))
        setCards(
          d.cards.map((c: CardItem) => ({
            ...c,
            language: c.language ?? "日本語",
            autographRequested: c.autographRequested ?? false,
          }))
        );
      if (typeof d.maxStep === "number") setMaxStep(Math.min(d.maxStep, 3));
      if (d.step && d.step !== "payment") setStep(d.step);
    } catch {
      /* ignore */
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (step !== "payment" || !clientSecret || !cardElementContainerRef.current) return;

    let cancelled = false;

    async function loadStripeJs() {
      if (!window.Stripe) {
        await new Promise<void>((resolve, reject) => {
          const existing = document.querySelector<HTMLScriptElement>('script[src="https://js.stripe.com/v3/"]');
          if (existing) {
            const wait = window.setInterval(() => {
              if (window.Stripe) {
                window.clearInterval(wait);
                resolve();
              }
            }, 50);
            window.setTimeout(() => {
              window.clearInterval(wait);
              if (window.Stripe) resolve();
              else reject(new Error("Stripe.js の読み込みに失敗しました"));
            }, 5000);
            return;
          }
          const script = document.createElement("script");
          script.src = "https://js.stripe.com/v3/";
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Stripe.js の読み込みに失敗しました"));
          document.head.appendChild(script);
        });
      }

      if (cancelled || !window.Stripe || !cardElementContainerRef.current) return;

      cardElementRef.current?.destroy();
      const stripe = window.Stripe(stripePublishableKey);
      const elements = stripe.elements({ clientSecret });
      const card = elements.create("card", {
        hidePostalCode: true,
        style: {
          base: {
            color: "#111827",
            fontSize: "16px",
            "::placeholder": { color: "#9ca3af" },
          },
          invalid: { color: "#b91c1c" },
        },
      });
      card.on("change", (event) => setCardError(event.error?.message ?? ""));
      card.mount(cardElementContainerRef.current);
      stripeRef.current = stripe;
      cardElementRef.current = card;
      setStripeReady(true);
    }

    setStripeReady(false);
    setCardError("");
    loadStripeJs().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Stripe.js の読み込みに失敗しました");
    });

    return () => {
      cancelled = true;
    };
  }, [clientSecret, step, stripePublishableKey]);

  function saveDraftToStorage() {
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ region, itemType, serviceLevel, returnMethod, cards, step, maxStep })
      );
    } catch {
      /* ignore */
    }
  }

  async function handleSaveAndExit() {
    saveDraftToStorage();
    // サービス選択済みならサーバーにも下書き保存（端末をまたいで再開可能に）
    if (serviceLevel) {
      const res = await saveDraftServer({
        draftId: draftId ?? undefined,
        serviceLevel,
        region,
        itemType,
        returnMethod,
        returnSel,
        cards: cards.map((c) => ({
          tcgTitle: c.tcgTitle,
          releaseYear: c.releaseYear,
          cardNumber: c.cardNumber,
          cardName: c.cardName,
          rarity: c.rarity,
          language: c.language,
          quantity: c.quantity,
          declaredValue: c.declaredValue,
          autographRequested: c.autographRequested,
        })),
      });
      if (res.success && res.draftId) setDraftId(res.draftId);
    }
    router.push("/mypage");
  }

  function goStep(key: StepKey) {
    const idx = STEPS.findIndex((s) => s.key === key);
    setMaxStep((m) => Math.max(m, idx));
    setStep(key);
  }

  async function handleSubmit() {
    if (!agreed) {
      setError("利用規約に同意してください");
      return;
    }
    if (!serviceLevel) {
      setError("サービスを選択してください");
      return;
    }
    const normalizedShippingPhone = shippingPhone.trim();
    if (!/^[0-9-+() ]{10,20}$/.test(normalizedShippingPhone)) {
      setError("電話番号を正しく入力してください");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const result = await createApplication({
        draftId: draftId ?? undefined,
        serviceLevel,
        region,
        itemType,
        returnMethod,
        cards: cards.map((c) => ({
          tcgTitle: c.tcgTitle,
          releaseYear: c.releaseYear ? parseInt(c.releaseYear) : undefined,
          cardName: c.cardName,
          cardNumber: c.cardNumber || undefined,
          rarity: c.rarity || undefined,
          language: c.language,
          declaredValue: c.declaredValue,
          quantity: c.quantity,
          damageImageKeys: [],
          autographRequested: c.autographRequested,
        })),
        returnAddress:
          returnSel !== "registered" && selectedAddr
            ? {
                name: selectedAddr.name,
                lastName: selectedAddr.lastName || undefined,
                firstName: selectedAddr.firstName || undefined,
                lastNameRoman: selectedAddr.lastNameRoman || undefined,
                firstNameRoman: selectedAddr.firstNameRoman || undefined,
                postalCode: selectedAddr.postalCode,
                prefecture: selectedAddr.prefecture,
                address: selectedAddr.address,
                address2: selectedAddr.address2 || undefined,
              }
            : undefined,
        shippingPhone: normalizedShippingPhone,
        agreementText: AGREEMENT_TEXT,
        agreementVersion: AGREEMENT_VERSION,
        ipAddress: "client",
        userAgent: navigator.userAgent,
      });

      if (result.success && result.clientSecret) {
        try {
          localStorage.removeItem(DRAFT_KEY);
        } catch {
          /* ignore */
        }
        setClientSecret(result.clientSecret);
        setCreatedApplicationId(result.applicationId ?? "");
        setMaxStep(4);
        setStep("payment");
      } else {
        setError(result.error ?? "エラーが発生しました");
      }
    } catch (err) {
      console.error(err);
      setError("申込処理中にエラーが発生しました。時間をおいて再度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  async function handlePayment() {
    if (!clientSecret) return;
    if (!stripeRef.current || !cardElementRef.current) {
      setError("カード入力欄の読み込みが完了していません");
      return;
    }
    setPaymentLoading(true);
    setError("");

    try {
      const { error: stripeError, paymentIntent } = await stripeRef.current.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElementRef.current,
          billing_details: { name: profile?.name ?? "Customer" },
        },
      });
      if (stripeError) {
        setError(stripeError.message ?? "決済エラーが発生しました");
        return;
      }

      const paymentIntentId = paymentIntent?.id ?? clientSecret.split("_secret_")[0];
      if (!createdApplicationId || !paymentIntentId) {
        setError("決済は完了しましたが、申込情報の確認に失敗しました。申込一覧から予約へ進んでください。");
        return;
      }

      const confirmed = await confirmApplicationPayment({
        applicationId: createdApplicationId,
        paymentIntentId,
      });

      if (!confirmed.success) {
        setError(
          confirmed.error ??
            "決済は完了しましたが、反映に時間がかかっています。少し待ってからカード提出予約へ進んでください。"
        );
        return;
      }

      router.push(`/mypage/submission-booking/${encodeURIComponent(createdApplicationId)}/edit`);
    } catch (err) {
      console.error(err);
      setError("決済処理中にエラーが発生しました。時間をおいて再度お試しください。");
    } finally {
      setPaymentLoading(false);
    }
  }

  const currentIdx = STEPS.findIndex((s) => s.key === step);

  const inputCls =
    "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500";

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          {/* ロゴ（クリックでトップへ） */}
          <Link href="/" className="shrink-0 hover:opacity-70 transition">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpg" alt="トレカビンクス" className="h-12 w-auto" />
          </Link>

          {/* 番号付きステッパー（到達済みステップはクリックで戻れる） */}
          <nav className="flex-1 flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm overflow-x-auto whitespace-nowrap">
            {STEPS.map((s, i) => {
              const reachable = i <= maxStep;
              const current = i === currentIdx;
              const reached = i <= currentIdx;
              return (
                <span key={s.key} className="flex items-center gap-1 sm:gap-2">
                  <button
                    type="button"
                    disabled={!reachable}
                    onClick={() => reachable && goStep(s.key)}
                    className={`flex items-center gap-1.5 ${reachable ? "cursor-pointer" : "cursor-default"}`}
                  >
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        reached ? "bg-brand-600 text-white" : "bg-gray-200 text-gray-500"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span
                      className={
                        current
                          ? "font-bold text-gray-900"
                          : reachable
                            ? "text-gray-600 hover:text-brand-700"
                            : "text-gray-400"
                      }
                    >
                      {s.label}
                    </span>
                  </button>
                  {i < STEPS.length - 1 && <span className="text-gray-300">›</span>}
                </span>
              );
            })}
          </nav>

          {/* 一時保存して終了 */}
          <div className="shrink-0 flex items-center gap-2">
            <Link
              href="/mypage/settings"
              aria-label="アカウント設定"
              title="アカウント設定"
              className="w-10 h-10 rounded-full border border-gray-300 bg-white flex items-center justify-center text-lg hover:border-brand-500 hover:bg-brand-50 transition"
            >
              <svg className="h-5 w-5 text-brand-600" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.42 0-8 2.69-8 6v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1c0-3.31-3.58-6-8-6Z" />
              </svg>
            </Link>
            <button
              onClick={handleSaveAndExit}
              className="border border-gray-300 rounded-full px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition"
            >
              保存・終了
            </button>
          </div>
        </div>
      </header>

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
                <h2 className="font-bold text-gray-800">アイテム種別</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(["TRADING_CARD", "UNOPENED_PACK", "COMIC_MAGAZINE"] as ItemType[]).map((it) => (
                    <button
                      key={it}
                      onClick={() => {
                        setItemType(it);
                        setServiceLevel(null);
                      }}
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
                    <p className="text-brand-600 font-medium">{formatMoney(sp.pricePerCard, region)}/枚</p>
                    <p className="text-xs text-gray-500">
                      申告価格上限{" "}
                      {sp.maxDeclaredValue === null ? "なし" : formatMoney(sp.maxDeclaredValue, region)}
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
                goStep("cards");
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
              選択中: <strong>{REGION_LABELS[region]}{region === "PSA_US" ? ` / ${ITEM_TYPE_LABELS[itemType]}` : ""} / {serviceLevel && SERVICE_LABELS[serviceLevel]}</strong>
              {cap !== null && <>（申告金額上限 {formatMoney(cap, region)}/枚）</>}
            </div>

            {/* Card entry form */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              <h2 className="font-bold text-gray-800">
                {editingIndex !== null ? "カードを編集" : "カード情報入力"}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <label className="block text-xs text-gray-500 mb-1">タイトル *</label>
                  <input
                    className={inputCls}
                    placeholder="例: ワンピースカードゲーム"
                    value={draft.tcgTitle}
                    onChange={(e) => setDraftField("tcgTitle", e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">言語</label>
                  <input
                    className={inputCls}
                    list="language-suggestions"
                    placeholder="例: 日本語"
                    value={draft.language}
                    onChange={(e) => setDraftField("language", e.target.value)}
                  />
                  <datalist id="language-suggestions">
                    {LANGUAGE_SUGGESTIONS.map((v) => (
                      <option key={v} value={v} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">カード番号／型番</label>
                  <input
                    className={inputCls}
                    placeholder="例: OP01-003"
                    value={draft.cardNumber}
                    onChange={(e) => setDraftField("cardNumber", e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">カード名 *</label>
                  <input
                    className={inputCls}
                    placeholder="例: モンキー・D・ルフィ"
                    value={draft.cardName}
                    onChange={(e) => setDraftField("cardName", e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">レアリティ</label>
                  <input
                    className={inputCls}
                    placeholder="例: Lパラレル"
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
                {autographActive && (
                  <div className="sm:col-span-2 flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="autographRequested"
                      checked={draft.autographRequested}
                      onChange={(e) => setDraftField("autographRequested", e.target.checked)}
                    />
                    <label htmlFor="autographRequested" className="text-sm text-gray-700">
                      オートグラフ（デュアルサービス）認証を希望する
                    </label>
                  </div>
                )}
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
                  申告合計 {formatMoney(totalDeclaredValue, region)}
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
                          {c.autographRequested && (
                            <span className="ml-2 text-xs bg-brand-100 text-brand-700 rounded-full px-2 py-0.5 align-middle">
                              🖊 オートグラフ
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-400">
                          {c.quantity}枚 / 申告 {formatMoney(c.declaredValue * c.quantity, region)}
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

            <button
              onClick={() => {
                if (cards.length === 0) {
                  setError("カードを1枚以上追加してください");
                  return;
                }
                setError("");
                goStep("shipping");
              }}
              className="w-full bg-brand-600 text-white font-bold py-3 rounded-xl hover:bg-brand-700 transition"
            >
              発送先へ進む
            </button>
          </div>
        )}

        {/* STEP 3: Shipping & Billing */}
        {step === "shipping" && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-gray-900">発送先（返却先）</h2>
                <span className="text-xs text-gray-500">
                  {returnMethod === "STORE_PICKUP" ? "店頭受取" : "配送"}
                </span>
              </div>
              {/* 登録住所（デフォルト） */}
              <label
                className={`flex items-start gap-3 border-2 rounded-lg p-4 cursor-pointer transition ${
                  returnSel === "registered" ? "border-brand-500 bg-brand-50" : "border-gray-200"
                }`}
              >
                <input
                  type="radio"
                  name="returnAddr"
                  checked={returnSel === "registered"}
                  onChange={() => setReturnSel("registered")}
                  className="mt-1"
                />
                <span className="text-sm text-gray-800">
                  {profile ? (
                    <>
                      <span className="font-medium">{profile.name} 様（登録住所）</span>
                      <br />
                      <span className="text-gray-600">
                        〒{profile.postalCode}　{profile.prefecture}
                        {profile.address}
                        {profile.address2 ? ` ${profile.address2}` : ""}
                      </span>
                    </>
                  ) : (
                    "登録住所"
                  )}
                </span>
              </label>

              {/* 住所帳（追加・編集・削除・デフォルト設定・選択） */}
              <AddressManager
                initialAddresses={addrList}
                selectable
                selectedId={returnSel === "registered" ? null : returnSel}
                onSelect={(id) => setReturnSel(id)}
                onChange={setAddrList}
              />

              <p className="text-xs text-gray-400">
                ※ 登録住所のままにする場合は上を選択してください。住所帳はマイページからも管理できます。
              </p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
              <h2 className="font-bold text-gray-900">電話番号</h2>
              <input
                type="tel"
                value={shippingPhone}
                onChange={(e) => setShippingPhone(e.target.value)}
                placeholder="090-1234-5678"
                className={inputCls}
              />
              <p className="text-xs text-gray-400">配送・連絡に使用します。</p>
            </div>

            <button
              onClick={() => {
                if (returnSel !== "registered" && !selectedAddr) {
                  setError("返送先を選択してください");
                  return;
                }
                if (!/^[0-9-+() ]{10,20}$/.test(shippingPhone.trim())) {
                  setError("電話番号を入力してください");
                  return;
                }
                setError("");
                goStep("confirm");
              }}
              className="w-full bg-brand-600 text-white font-bold py-3 rounded-xl hover:bg-brand-700 transition"
            >
              確認へ進む
            </button>
          </div>
        )}

        {/* STEP 4: Confirm */}
        {step === "confirm" && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-bold text-gray-900 mb-3">申込内容の確認</h2>
              <div className="text-sm text-gray-600 mb-2">
                <span className="font-medium">提出先:</span> {REGION_LABELS[region]}
                {region === "PSA_US" && <> / <span className="font-medium">アイテム種別:</span> {ITEM_TYPE_LABELS[itemType]}</>}
                {" / "}
                <span className="font-medium">サービス:</span>{" "}
                {serviceLevel && SERVICE_LABELS[serviceLevel]} /{" "}
                <span className="font-medium">返却:</span>{" "}
                {returnMethod === "STORE_PICKUP" ? "店頭受取" : "配送"}
              </div>
              <div className="text-sm text-gray-600 mb-3">
                <span className="font-medium">返送先:</span>{" "}
                {returnSel !== "registered" && selectedAddr
                  ? `${selectedAddr.name}／〒${selectedAddr.postalCode} ${selectedAddr.prefecture}${selectedAddr.address}${selectedAddr.address2 ? ` ${selectedAddr.address2}` : ""}`
                  : profile
                    ? `${profile.name}（登録住所）`
                    : "登録住所"}
              </div>
              <div className="divide-y divide-gray-100">
                {cards.map((c, i) => (
                  <div key={i} className="flex justify-between text-sm text-gray-700 py-1">
                    <span>
                      {i + 1}. {c.releaseYear ? `${c.releaseYear} ` : ""}
                      {c.cardName}（{c.tcgTitle}）× {c.quantity}枚
                    </span>
                    <span className="text-gray-500">
                      申告 {formatMoney(c.declaredValue * c.quantity, region)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">鑑定料</span><span>{formatMoney(psaFeeTotal, region)}</span></div>
              {autographFeeTotal > 0 && (
                <div className="flex justify-between"><span className="text-gray-500">オートグラフ料金</span><span>{formatMoney(autographFeeTotal, region)}</span></div>
              )}
              <div className="flex justify-between"><span className="text-gray-500">送料・保険料</span><span>{formatMoney(shippingInsuranceFee, region)}</span></div>
              {handlingFee > 0 && (
                <div className="flex justify-between"><span className="text-gray-500">事務手数料</span><span>{formatMoney(handlingFee, region)}</span></div>
              )}
              {discountAmount > 0 && (
                <div className="flex justify-between text-brand-700">
                  <span>キャンペーン割引{campaignName ? `（${campaignName}）` : ""}</span>
                  <span>-{formatMoney(discountAmount, region)}</span>
                </div>
              )}
              <div className="flex justify-between"><span className="text-gray-500">消費税</span><span>{formatMoney(taxAmount, region)}</span></div>
              <div className="flex justify-between font-bold text-gray-900 border-t border-gray-100 pt-2 mt-2">
                <span>合計</span><span>{formatMoney(totalAmount, region)}</span>
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
              className="w-full bg-brand-600 text-white font-bold py-3 rounded-xl hover:bg-brand-700 disabled:opacity-50 transition"
            >
              {loading ? "処理中..." : "申込を確定して決済へ"}
            </button>
          </div>
        )}

        {/* STEP 4: Payment */}
        {step === "payment" && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              <div>
                <h2 className="font-bold text-gray-900">お支払い</h2>
                <p className="text-sm text-gray-500 mt-1">
                  カード情報を入力して決済を完了してください。決済後、カード提出予約へ進みます。
                </p>
              </div>
              <div className="rounded-lg border border-gray-300 bg-white px-3 py-3 focus-within:ring-2 focus-within:ring-brand-500">
                <div ref={cardElementContainerRef} className="min-h-6" />
              </div>
              {cardError && <p className="text-sm text-red-600">{cardError}</p>}
              {!stripeReady && (
                <p className="text-sm text-brand-700">カード入力欄を読み込んでいます...</p>
              )}
              <button
                onClick={handlePayment}
                disabled={paymentLoading || !stripeReady || !!cardError}
                className="w-full bg-brand-600 text-white font-bold py-3 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition"
              >
                {paymentLoading ? "決済処理中..." : `${formatMoney(totalAmount, region)} を支払う`}
              </button>
              <p className="text-xs text-gray-400 text-center">
                カード情報はStripe上で安全に処理され、このサービスには保存されません。
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
