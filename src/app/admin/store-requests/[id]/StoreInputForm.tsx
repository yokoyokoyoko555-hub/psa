"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { completeStoreApplication, saveStoreInputDraft } from "@/actions/admin";
import type { CustomServicePrice } from "@prisma/client";
import { formatMoney, formatMoneyInt, currencySymbol } from "@/lib/currency";

const ITEM_TYPE_LABELS: Record<string, string> = {
  TRADING_CARD: "トレーディングカード",
  UNOPENED_PACK: "未開封パック",
  COMIC_MAGAZINE: "コミック・マガジン",
};

const LANGUAGE_SUGGESTIONS = ["日本語", "英語", "韓国語", "中国語", "その他"];

interface CardRow {
  tcgTitle: string;
  cardName: string;
  cardNumber: string;
  rarity: string;
  language: string;
  declaredValue: number;
  quantity: number;
  notes: string;
  autographRequested: boolean;
  autographCustomServiceLevelId: string | null;
}

function newRow(): CardRow {
  return {
    tcgTitle: "",
    cardName: "",
    cardNumber: "",
    rarity: "",
    language: "日本語",
    declaredValue: 0,
    quantity: 1,
    notes: "",
    autographRequested: false,
    autographCustomServiceLevelId: null,
  };
}

/** 下書きJSON（unknown）を CardRow に正規化する */
function toCardRow(raw: unknown): CardRow {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    tcgTitle: typeof r.tcgTitle === "string" ? r.tcgTitle : "",
    cardName: typeof r.cardName === "string" ? r.cardName : "",
    cardNumber: typeof r.cardNumber === "string" ? r.cardNumber : "",
    rarity: typeof r.rarity === "string" ? r.rarity : "",
    language: typeof r.language === "string" ? r.language : "日本語",
    declaredValue: typeof r.declaredValue === "number" ? r.declaredValue : 0,
    quantity: typeof r.quantity === "number" && r.quantity >= 1 ? r.quantity : 1,
    notes: typeof r.notes === "string" ? r.notes : "",
    autographRequested: typeof r.autographRequested === "boolean" ? r.autographRequested : false,
    autographCustomServiceLevelId:
      typeof r.autographCustomServiceLevelId === "string" ? r.autographCustomServiceLevelId : null,
  };
}

export default function StoreInputForm({
  applicationId,
  region,
  itemType,
  customServicePrices = [],
  autographPricing = [],
  masterNames = [],
  initialDraft = null,
}: {
  applicationId: string;
  region: string;
  itemType: string;
  customServicePrices?: CustomServicePrice[];
  autographPricing?: CustomServicePrice[];
  masterNames?: string[];
  initialDraft?: { customServiceLevelId?: string; cards?: unknown[] } | null;
}) {
  const router = useRouter();
  const draftCards = initialDraft?.cards?.map(toCardRow) ?? [];
  // 選択したCustomServicePrice.id（category=itemType）。トレカ含む全itemType共通。ADR-0025/0026
  const [customServiceLevelId, setCustomServiceLevelId] = useState<string | null>(
    initialDraft?.customServiceLevelId ?? customServicePrices[0]?.id ?? null
  );
  const [cards, setCards] = useState<CardRow[]>(draftCards.length > 0 ? draftCards : [newRow()]);
  const [loading, setLoading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState("");

  const selectedCustomTier = customServicePrices.find((p) => p.id === customServiceLevelId);
  const hasSelectedService = !!customServiceLevelId;
  const isAutographEligible = region === "PSA_US" && itemType === "TRADING_CARD";
  const activeAutographTiers = isAutographEligible ? autographPricing.filter((a) => a.isActive) : [];
  const autographActive = activeAutographTiers.length > 0;

  async function handleSaveDraft() {
    setError("");
    setSavingDraft(true);
    const result = await saveStoreInputDraft({
      applicationId,
      customServiceLevelId: customServiceLevelId ?? undefined,
      cards: cards.map((c) => ({
        tcgTitle: c.tcgTitle,
        cardName: c.cardName,
        cardNumber: c.cardNumber,
        rarity: c.rarity,
        language: c.language,
        declaredValue: c.declaredValue,
        quantity: c.quantity,
        notes: c.notes,
        autographRequested: c.autographRequested,
        autographCustomServiceLevelId: c.autographCustomServiceLevelId ?? undefined,
      })),
    });
    setSavingDraft(false);
    if (result.success) {
      setSavedAt(new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }));
    } else {
      setError(result.error ?? "一時保存に失敗しました");
    }
  }

  function update<K extends keyof CardRow>(i: number, field: K, value: CardRow[K]) {
    setCards((prev) => prev.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)));
  }

  async function handleSubmit() {
    setError("");
    if (!hasSelectedService) {
      setError("サービスレベルを選択してください");
      return;
    }
    if (cards.some((c) => !c.tcgTitle || !c.cardName || c.declaredValue < 1)) {
      setError(`各カードのTCGタイトル・カード名・申告価格（1${currencySymbol(region)}以上）を入力してください`);
      return;
    }
    setLoading(true);
    const result = await completeStoreApplication({
      applicationId,
      customServiceLevelId: customServiceLevelId ?? undefined,
      cards: cards.map((c) => ({
        tcgTitle: c.tcgTitle,
        cardName: c.cardName,
        cardNumber: c.cardNumber || undefined,
        rarity: c.rarity || undefined,
        language: c.language,
        declaredValue: c.declaredValue,
        quantity: c.quantity,
        notes: c.notes || undefined,
        autographRequested: c.autographRequested,
        autographCustomServiceLevelId: c.autographCustomServiceLevelId ?? undefined,
      })),
    });
    setLoading(false);
    if (result.success) {
      router.push("/admin/store-requests");
      router.refresh();
    } else {
      setError(result.error ?? "確定に失敗しました");
    }
  }

  return (
    <div className="space-y-6">
      <datalist id="card-name-master">
        {masterNames.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-bold text-gray-900 mb-3">サービスレベル</h2>
        {region === "PSA_US" && (
          <p className="text-xs text-gray-500 mb-2">アイテム種別: {ITEM_TYPE_LABELS[itemType] ?? itemType}</p>
        )}
        <select
          value={customServiceLevelId ?? ""}
          onChange={(e) => setCustomServiceLevelId(e.target.value || null)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
        >
          <option value="">選択してください</option>
          {customServicePrices.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}（{formatMoney(p.pricePerCard, region)}/枚）
              {p.maxDeclaredValue !== null ? ` 上限${formatMoneyInt(p.maxDeclaredValue, region)}` : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-900">カード明細</h2>
          <button
            type="button"
            onClick={() => setCards((p) => [...p, newRow()])}
            className="text-brand-600 text-sm font-medium hover:text-brand-800"
          >
            + カードを追加
          </button>
        </div>

        {cards.map((c, i) => (
          <div key={i} className="border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-bold text-gray-800 text-sm">カード {i + 1}</p>
              {cards.length > 1 && (
                <button
                  type="button"
                  onClick={() => setCards((p) => p.filter((_, idx) => idx !== i))}
                  className="text-red-500 text-xs hover:text-red-700"
                >
                  削除
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                placeholder="TCGタイトル（例: ポケモンカード）"
                value={c.tcgTitle}
                onChange={(e) => update(i, "tcgTitle", e.target.value)}
                className="border border-gray-300 rounded px-3 py-2 text-sm text-gray-900"
              />
              <input
                placeholder="カード名（例: リザードン）"
                list="card-name-master"
                value={c.cardName}
                onChange={(e) => update(i, "cardName", e.target.value)}
                className="border border-gray-300 rounded px-3 py-2 text-sm text-gray-900"
              />
              <input
                placeholder="型番（任意）"
                value={c.cardNumber}
                onChange={(e) => update(i, "cardNumber", e.target.value)}
                className="border border-gray-300 rounded px-3 py-2 text-sm text-gray-900"
              />
              <input
                placeholder="レアリティ（任意）"
                value={c.rarity}
                onChange={(e) => update(i, "rarity", e.target.value)}
                className="border border-gray-300 rounded px-3 py-2 text-sm text-gray-900"
              />
              <input
                placeholder="言語（例: 日本語）"
                list="language-suggestions"
                value={c.language}
                onChange={(e) => update(i, "language", e.target.value)}
                className="border border-gray-300 rounded px-3 py-2 text-sm text-gray-900"
              />
              <input
                type="number"
                placeholder={`申告価格（${currencySymbol(region)}）`}
                value={c.declaredValue || ""}
                min={1}
                onChange={(e) => update(i, "declaredValue", parseInt(e.target.value) || 0)}
                className="border border-gray-300 rounded px-3 py-2 text-sm text-gray-900"
              />
              <input
                type="number"
                placeholder="枚数"
                value={c.quantity}
                min={1}
                onChange={(e) => update(i, "quantity", parseInt(e.target.value) || 1)}
                className="border border-gray-300 rounded px-3 py-2 text-sm text-gray-900"
              />
              {autographActive && activeAutographTiers.length === 1 && (
                <label className="flex items-center gap-2 text-sm text-gray-700 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={c.autographRequested}
                    onChange={(e) => {
                      update(i, "autographRequested", e.target.checked);
                      update(
                        i,
                        "autographCustomServiceLevelId",
                        e.target.checked ? activeAutographTiers[0].id : null
                      );
                    }}
                  />
                  オートグラフ（デュアルサービス）認証希望（{formatMoney(activeAutographTiers[0].pricePerCard, region)}/枚）
                </label>
              )}
              {autographActive && activeAutographTiers.length > 1 && (
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">オートグラフ（デュアルサービス）認証</label>
                  <select
                    className="border border-gray-300 rounded px-3 py-2 text-sm text-gray-900 w-full"
                    value={c.autographRequested ? c.autographCustomServiceLevelId ?? "" : ""}
                    onChange={(e) => {
                      const id = e.target.value;
                      update(i, "autographRequested", !!id);
                      update(i, "autographCustomServiceLevelId", id || null);
                    }}
                  >
                    <option value="">希望しない</option>
                    {activeAutographTiers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}（{formatMoney(t.pricePerCard, region)}/枚）
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <datalist id="language-suggestions">
        {LANGUAGE_SUGGESTIONS.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>

      {selectedCustomTier && (
        <p className="text-sm text-gray-500">
          ※ 確定すると料金が計算され（手数料あり）、申込が確定します。決済はStripe統合後に通電予定です。
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={savingDraft || loading}
          className="flex-1 border border-brand-600 text-brand-700 font-bold py-3 rounded-lg hover:bg-brand-50 disabled:opacity-50 transition"
        >
          {savingDraft ? "保存中..." : "一時保存"}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || savingDraft}
          className="flex-[2] bg-brand-600 text-white font-bold py-3 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition"
        >
          {loading ? "確定中..." : "入力を確定する"}
        </button>
      </div>
      {savedAt && (
        <p className="text-right text-xs text-gray-500">一時保存しました（{savedAt}）。この画面を離れても内容は復元されます。</p>
      )}
    </div>
  );
}
