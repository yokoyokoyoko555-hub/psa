"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { completeStoreApplication, previewStoreApplicationFees, saveStoreInputDraft } from "@/actions/admin";
import type { CustomServicePrice } from "@prisma/client";
import { formatMoney, formatMoneyIn, formatMoneyInt, currencySymbol } from "@/lib/currency";

type PreviewResult = Awaited<ReturnType<typeof previewStoreApplicationFees>>;

const ITEM_TYPE_LABELS: Record<string, string> = {
  TRADING_CARD: "トレーディングカード",
  UNOPENED_PACK: "未開封パック",
  COMIC_MAGAZINE: "コミック・マガジン",
};

// アイテム種別ごとの入力欄ラベル・単位・表示切替（ApplyForm.tsxと同じ考え方）。ADR-0033
const CARD_FIELD_LABELS: Record<
  string,
  {
    entryLabel: string;
    releaseYearLabel: string;
    releaseYearPlaceholder: string;
    secondaryLabel: string; // languageフィールドの表示名（言語／出版社）
    secondaryPlaceholder: string;
    nameLabel: string; // cardNameフィールドの表示名（カード名／パック名／巻数・号）
    namePlaceholder: string;
    quantityLabel: string;
    quantityUnit: string;
    showCardNumberRarity: boolean;
  }
> = {
  TRADING_CARD: {
    entryLabel: "カード",
    releaseYearLabel: "発行年",
    releaseYearPlaceholder: "例: 2022",
    secondaryLabel: "言語",
    secondaryPlaceholder: "例: 日本語",
    nameLabel: "カード名",
    namePlaceholder: "例: モンキー・D・ルフィ",
    quantityLabel: "枚数",
    quantityUnit: "枚",
    showCardNumberRarity: true,
  },
  UNOPENED_PACK: {
    entryLabel: "パック",
    releaseYearLabel: "発行年",
    releaseYearPlaceholder: "例: 2022",
    secondaryLabel: "言語",
    secondaryPlaceholder: "例: 日本語",
    nameLabel: "パック名",
    namePlaceholder: "例: ロマンスドーン",
    quantityLabel: "枚数",
    quantityUnit: "枚",
    showCardNumberRarity: false,
  },
  COMIC_MAGAZINE: {
    entryLabel: "コミック／マガジン",
    releaseYearLabel: "発行年月",
    releaseYearPlaceholder: "例: 2022年5月",
    secondaryLabel: "出版社",
    secondaryPlaceholder: "例: 集英社",
    nameLabel: "巻数・号",
    namePlaceholder: "例: 3巻",
    quantityLabel: "冊数",
    quantityUnit: "冊",
    showCardNumberRarity: false,
  },
};

const LANGUAGE_SUGGESTIONS = ["日本語", "英語", "韓国語", "中国語", "その他"];

interface CardRow {
  tcgTitle: string;
  releaseYear: string;
  cardName: string;
  cardNumber: string;
  rarity: string;
  language: string;
  declaredValue: number;
  quantity: number;
  notes: string;
  // カードごとに選択したCustomServicePrice.id（複数サービスレベルにまたがる代理入力に対応）。ADR-0038
  customServiceLevelId: string;
}

function newRow(): CardRow {
  return {
    tcgTitle: "",
    releaseYear: "",
    cardName: "",
    cardNumber: "",
    rarity: "",
    language: "日本語",
    declaredValue: 0,
    quantity: 1,
    notes: "",
    customServiceLevelId: "",
  };
}

/** 下書きJSON（unknown）を CardRow に正規化する */
function toCardRow(raw: unknown): CardRow {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    tcgTitle: typeof r.tcgTitle === "string" ? r.tcgTitle : "",
    releaseYear: typeof r.releaseYear === "string" ? r.releaseYear : "",
    cardName: typeof r.cardName === "string" ? r.cardName : "",
    cardNumber: typeof r.cardNumber === "string" ? r.cardNumber : "",
    rarity: typeof r.rarity === "string" ? r.rarity : "",
    language: typeof r.language === "string" ? r.language : "日本語",
    declaredValue: typeof r.declaredValue === "number" ? r.declaredValue : 0,
    quantity: typeof r.quantity === "number" && r.quantity >= 1 ? r.quantity : 1,
    notes: typeof r.notes === "string" ? r.notes : "",
    customServiceLevelId: typeof r.customServiceLevelId === "string" ? r.customServiceLevelId : "",
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
  initialDraft?: { cards?: unknown[] } | null;
}) {
  const router = useRouter();
  const [cards, setCards] = useState<CardRow[]>(initialDraft?.cards?.map(toCardRow) ?? []);
  const [draft, setDraft] = useState<CardRow>(newRow());
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  // 料金確認プレビュー。カード内容編集時はnullに戻し、必ず最新内容で再確認させる。ADR-0042
  const [preview, setPreview] = useState<Extract<PreviewResult, { success: true }> | null>(null);

  const isAutographEligible = region === "PSA_US" && itemType === "TRADING_CARD";
  const activeAutographTiers = isAutographEligible ? autographPricing.filter((a) => a.isActive) : [];
  const autographActive = activeAutographTiers.length > 0;
  const allTiers = [...customServicePrices, ...activeAutographTiers];
  const fieldLabels = CARD_FIELD_LABELS[itemType] ?? CARD_FIELD_LABELS.TRADING_CARD;
  // 顧客向けApplyForm.tsxのカード情報入力欄と同じ見た目・同じ「1件ずつ入力→保存→一覧」の流れにする。ADR-0039/0061
  const inputCls =
    "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500";

  const totalDeclaredValue = cards.reduce((s, c) => s + c.declaredValue * c.quantity, 0);

  function setDraftField<K extends keyof CardRow>(field: K, value: CardRow[K]) {
    setDraft((d) => ({ ...d, [field]: value }));
  }

  function clearDraft() {
    setDraft(newRow());
    setEditingIndex(null);
    setError("");
  }

  function saveDraftCard() {
    setError("");
    if (!draft.customServiceLevelId) {
      setError("サービスレベルを選択してください");
      return;
    }
    if (!draft.tcgTitle.trim() || !draft.cardName.trim()) {
      setError(`タイトルと${fieldLabels.nameLabel}は必須です`);
      return;
    }
    // 発行年の範囲チェックは「トレカ／未開封パック」のみ。コミック・マガジンは発行年月の自由記述のため対象外。ADR-0033
    if (itemType !== "COMIC_MAGAZINE" && draft.releaseYear.trim()) {
      const y = parseInt(draft.releaseYear, 10);
      if (!Number.isInteger(y) || y < 1900 || y > 2100) {
        setError(`${fieldLabels.releaseYearLabel}は1900〜2100の範囲で入力してください（空欄でも構いません）`);
        return;
      }
    }
    if (draft.declaredValue < 1) {
      setError("申告金額を入力してください");
      return;
    }
    const tier = allTiers.find((t) => t.id === draft.customServiceLevelId);
    if (tier?.maxDeclaredValue != null && draft.declaredValue > tier.maxDeclaredValue) {
      setError(`申告価格上限（${formatMoneyInt(tier.maxDeclaredValue, region)}）を超えています。上位サービスを選択してください。`);
      return;
    }
    if (draft.quantity < 1) {
      setError(`${fieldLabels.quantityLabel}は1以上で入力してください`);
      return;
    }

    if (editingIndex !== null) {
      setCards((prev) => prev.map((c, i) => (i === editingIndex ? draft : c)));
    } else {
      setCards((prev) => [...prev, draft]);
    }
    clearDraft();
    setPreview(null);
  }

  function editCard(i: number) {
    setDraft(cards[i]);
    setEditingIndex(i);
    setError("");
  }

  // 似た内容のアイテムを続けて追加しやすいよう、選択した行の内容を上の入力欄に複製する
  // （編集と異なり既存の行は残したまま、保存すると新しい行として追加される）。
  function copyCard(i: number) {
    setDraft({ ...cards[i] });
    setEditingIndex(null);
    setError("");
  }

  function deleteCard(i: number) {
    setCards((prev) => prev.filter((_, idx) => idx !== i));
    if (editingIndex === i) clearDraft();
    setPreview(null);
  }

  async function handleSaveDraft() {
    setError("");
    setSavingDraft(true);
    const result = await saveStoreInputDraft({
      applicationId,
      cards: cards.map((c) => ({
        tcgTitle: c.tcgTitle,
        releaseYear: c.releaseYear,
        cardName: c.cardName,
        cardNumber: c.cardNumber,
        rarity: c.rarity,
        language: c.language,
        declaredValue: c.declaredValue,
        quantity: c.quantity,
        notes: c.notes,
        customServiceLevelId: c.customServiceLevelId,
      })),
    });
    setSavingDraft(false);
    if (result.success) {
      setSavedAt(new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }));
    } else {
      setError(result.error ?? "一時保存に失敗しました");
    }
  }

  function validateCards(): string | null {
    if (cards.length === 0) {
      return `${fieldLabels.entryLabel}を1${fieldLabels.quantityUnit}以上追加してください`;
    }
    if (cards.some((c) => !c.customServiceLevelId)) {
      return `各${fieldLabels.entryLabel}のサービスレベルを選択してください`;
    }
    if (cards.some((c) => !c.tcgTitle || !c.cardName || c.declaredValue < 1)) {
      return `各${fieldLabels.entryLabel}のTCGタイトル・${fieldLabels.nameLabel}・申告価格（1${currencySymbol(region)}以上）を入力してください`;
    }
    // 申告価格上限は各カードが選択したタイアの上限と比較する。ADR-0038
    const overCap = cards.find((c) => {
      const tier = allTiers.find((t) => t.id === c.customServiceLevelId);
      return tier?.maxDeclaredValue != null && c.declaredValue > tier.maxDeclaredValue;
    });
    if (overCap) {
      const tier = allTiers.find((t) => t.id === overCap.customServiceLevelId)!;
      return `申告価格上限（${formatMoneyInt(tier.maxDeclaredValue!, region)}）を超えています（${overCap.cardName}: ${formatMoneyInt(overCap.declaredValue, region)}）。`;
    }
    return null;
  }

  function buildCardsPayload() {
    return cards.map((c) => ({
      tcgTitle: c.tcgTitle,
      releaseYear: c.releaseYear || undefined,
      cardName: c.cardName,
      cardNumber: c.cardNumber || undefined,
      rarity: c.rarity || undefined,
      language: c.language,
      declaredValue: c.declaredValue,
      quantity: c.quantity,
      notes: c.notes || undefined,
      customServiceLevelId: c.customServiceLevelId,
    }));
  }

  /** 確定前に料金内訳をスタッフが確認するプレビュー計算。編集不可・確認のみ。ADR-0042 */
  async function handlePreview() {
    setError("");
    const validationError = validateCards();
    if (validationError) {
      setError(validationError);
      return;
    }
    setPreviewing(true);
    const result = await previewStoreApplicationFees({ applicationId, cards: buildCardsPayload() });
    setPreviewing(false);
    if (result.success) {
      setPreview(result);
    } else {
      setError(result.error);
    }
  }

  async function handleConfirm() {
    setError("");
    setLoading(true);
    const result = await completeStoreApplication({ applicationId, cards: buildCardsPayload() });
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

      {region === "PSA_US" && (
        <div className="bg-brand-50 border border-brand-200 rounded-xl p-4 text-sm text-brand-800">
          アイテム種別: <strong>{ITEM_TYPE_LABELS[itemType] ?? itemType}</strong>
        </div>
      )}

      {/* Card entry form（自己入力ApplyForm.tsxと同じ「1件ずつ入力→保存」の流れ） */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="font-bold text-gray-800">
          {editingIndex !== null ? `${fieldLabels.entryLabel}を編集` : `${fieldLabels.entryLabel}情報入力`}
        </h2>
        <div>
          <label className="block text-xs text-gray-500 mb-1">サービスレベル *</label>
          <select
            value={draft.customServiceLevelId}
            onChange={(e) => setDraftField("customServiceLevelId", e.target.value)}
            className={inputCls}
          >
            <option value="">サービスレベルを選択</option>
            {customServicePrices.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}（{formatMoney(p.pricePerCard, region)}/枚）
                {p.maxDeclaredValue !== null ? ` 上限${formatMoneyInt(p.maxDeclaredValue, region)}` : ""}
              </option>
            ))}
            {autographActive && (
              <optgroup label="デュアルサービス（カードとサインの鑑定）">
                {activeAutographTiers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}（{formatMoney(t.pricePerCard, region)}/枚）
                    {t.maxDeclaredValue !== null ? ` 上限${formatMoneyInt(t.maxDeclaredValue, region)}` : ""}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <p className="text-xs text-gray-400 mt-1">
            複数のサービスレベルが混在する場合も、{fieldLabels.entryLabel}ごとに選択してください。
            {autographActive && "デュアルサービスは通常サービスの代わりに選択します（追加料金ではありません）。"}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">{fieldLabels.releaseYearLabel}</label>
            <input
              type={itemType === "COMIC_MAGAZINE" ? "text" : "number"}
              className={inputCls}
              placeholder={fieldLabels.releaseYearPlaceholder}
              value={draft.releaseYear}
              onChange={(e) => setDraftField("releaseYear", e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">タイトル *</label>
            <input
              className={inputCls}
              placeholder="例: ワンピース"
              value={draft.tcgTitle}
              onChange={(e) => setDraftField("tcgTitle", e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{fieldLabels.secondaryLabel}</label>
            <input
              className={inputCls}
              list={itemType !== "COMIC_MAGAZINE" ? "language-suggestions" : undefined}
              placeholder={fieldLabels.secondaryPlaceholder}
              value={draft.language}
              onChange={(e) => setDraftField("language", e.target.value)}
            />
          </div>
          {fieldLabels.showCardNumberRarity && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">カード番号／型番</label>
              <input
                className={inputCls}
                placeholder="例: OP01-003"
                value={draft.cardNumber}
                onChange={(e) => setDraftField("cardNumber", e.target.value)}
              />
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-1">{fieldLabels.nameLabel} *</label>
            <input
              className={inputCls}
              placeholder={fieldLabels.namePlaceholder}
              list={fieldLabels.showCardNumberRarity ? "card-name-master" : undefined}
              value={draft.cardName}
              onChange={(e) => setDraftField("cardName", e.target.value)}
            />
          </div>
          {fieldLabels.showCardNumberRarity && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">レアリティ</label>
              <input
                className={inputCls}
                placeholder="例: Lパラレル"
                value={draft.rarity}
                onChange={(e) => setDraftField("rarity", e.target.value)}
              />
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-1">{fieldLabels.quantityLabel} *</label>
            <input
              type="number"
              min={1}
              className={inputCls}
              placeholder="例: 1"
              value={draft.quantity || ""}
              onChange={(e) => setDraftField("quantity", parseInt(e.target.value) || 0)}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">申告金額（{currencySymbol(region)}） *</label>
            <input
              type="number"
              min={1}
              className={inputCls}
              placeholder={region === "PSA_US" ? "例: 500" : "例: 50000"}
              value={draft.declaredValue || ""}
              onChange={(e) => setDraftField("declaredValue", parseInt(e.target.value) || 0)}
            />
          </div>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={saveDraftCard}
            className="bg-brand-600 text-white font-bold px-6 py-2 rounded-lg hover:bg-brand-700 transition"
          >
            {editingIndex !== null ? "更新" : "保存"}
          </button>
          <button
            type="button"
            onClick={clearDraft}
            className="border border-gray-300 text-gray-600 px-6 py-2 rounded-lg hover:bg-gray-50 transition"
          >
            消去
          </button>
        </div>
      </div>
      <datalist id="language-suggestions">
        {LANGUAGE_SUGGESTIONS.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>

      {/* Saved cards list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-800">{fieldLabels.entryLabel}明細（{cards.length}）</h3>
          <span className="text-sm text-gray-500">申告合計 {formatMoneyInt(totalDeclaredValue, region)}</span>
        </div>
        {cards.length === 0 ? (
          <p className="px-4 py-8 text-center text-gray-400 text-sm">
            上のフォームから{fieldLabels.entryLabel}を追加してください
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {cards.map((c, i) => {
              const tier = allTiers.find((t) => t.id === c.customServiceLevelId);
              return (
                <div key={i} className="px-4 py-3 flex items-center gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {c.releaseYear ? `${c.releaseYear} ` : ""}
                      {c.tcgTitle} {c.cardNumber} {c.cardName}
                      {c.rarity ? `（${c.rarity}）` : ""}
                    </p>
                    <p className="text-xs text-gray-400">
                      {tier?.name ?? "サービスレベル未選択"} / {c.quantity}
                      {fieldLabels.quantityUnit} / 申告 {formatMoneyInt(c.declaredValue * c.quantity, region)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyCard(i)}
                    className="text-gray-500 hover:text-gray-700 text-sm font-medium"
                  >
                    コピー
                  </button>
                  <button
                    type="button"
                    onClick={() => editCard(i)}
                    className="text-brand-600 hover:text-brand-800 text-sm font-medium"
                  >
                    編集
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteCard(i)}
                    className="text-red-500 hover:text-red-700 text-sm font-medium"
                  >
                    削除
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {preview && (
        <div className="bg-white rounded-xl border border-brand-300 p-6 space-y-2">
          <h2 className="font-bold text-gray-900 mb-2">請求内容の確認（編集不可）</h2>
          <div className="text-sm space-y-1">
            {allTiers
              .map((tier) => {
                const quantity = cards
                  .filter((c) => c.customServiceLevelId === tier.id)
                  .reduce((sum, c) => sum + c.quantity, 0);
                return { tier, quantity };
              })
              .filter(({ quantity }) => quantity > 0)
              .map(({ tier, quantity }) => (
                <div key={tier.id} className="flex justify-between text-gray-600">
                  <span>
                    鑑定料（{tier.name}）
                    <span className="text-xs text-gray-400">
                      {" "}
                      {formatMoney(tier.pricePerCard, region)}×{quantity}
                      {fieldLabels.quantityUnit}
                    </span>
                  </span>
                  <span>{formatMoney(tier.pricePerCard * quantity, region)}</span>
                </div>
              ))}
            <div className="flex justify-between text-gray-600">
              <span>代理入力手数料</span>
              <span>
                {formatMoneyIn(preview.fees.agencyFeeTotal, "JPY")}
                {preview.agencyTypeCountEstimated != null && preview.agencyTypeCountEstimated !== preview.agencyTypeCountActual && (
                  <span className="text-xs text-amber-600 ml-1">
                    （見積り{preview.agencyTypeCountEstimated}種 → 実績{preview.agencyTypeCountActual}種）
                  </span>
                )}
              </span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>事務手数料</span><span>{formatMoneyIn(preview.fees.handlingFee, "JPY")}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>送料・保険料</span><span>{formatMoneyIn(preview.fees.shippingFee + preview.fees.insuranceFee, "JPY")}</span>
            </div>
            {preview.fees.discountAmount > 0 && (
              <div className="flex justify-between text-brand-700">
                <span>割引{preview.fees.campaignName ? `（${preview.fees.campaignName}）` : ""}</span>
                <span>-{formatMoneyIn(preview.fees.discountAmount, "JPY")}</span>
              </div>
            )}
            <div className="flex justify-between font-bold border-t border-gray-200 pt-1 mt-1">
              <span>合計</span><span>{formatMoneyIn(preview.fees.totalAmount, "JPY")}</span>
            </div>
            <div className="flex justify-between text-gray-500 text-xs">
              <span>（内消費税 {formatMoneyIn(preview.fees.taxAmount, "JPY")}）</span>
            </div>
            <div className="flex justify-between text-gray-500 text-xs">
              <span>先払い済み額</span><span>{formatMoneyIn(preview.fees.totalAmount - preview.additionalAmount, "JPY")}</span>
            </div>
            <div className="flex justify-between font-bold text-brand-700 border-t border-gray-200 pt-1 mt-1">
              <span>顧客への請求額（差額）</span><span>{formatMoneyIn(preview.additionalAmount, "JPY")}</span>
            </div>
          </div>
          <p className="text-xs text-gray-500 pt-2">
            ※ 確定すると顧客に通知が届き、マイページで内容確認のうえ能動的にお支払いいただきます（自動課金はしません）。
          </p>
        </div>
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
        {preview ? (
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="flex-[2] bg-brand-600 text-white font-bold py-3 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition"
          >
            {loading ? "確定中..." : "この内容で確定する"}
          </button>
        ) : (
          <button
            type="button"
            onClick={handlePreview}
            disabled={previewing || savingDraft}
            className="flex-[2] bg-brand-600 text-white font-bold py-3 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition"
          >
            {previewing ? "計算中..." : "料金を確認する"}
          </button>
        )}
      </div>
      {savedAt && (
        <p className="text-right text-xs text-gray-500">一時保存しました（{savedAt}）。この画面を離れても内容は復元されます。</p>
      )}
    </div>
  );
}
