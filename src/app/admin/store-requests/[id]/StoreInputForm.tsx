"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { completeStoreApplication } from "@/actions/admin";
import { CardLanguage, ServiceLevel } from "@prisma/client";
import type { ServicePrice } from "@prisma/client";

const SERVICE_LABELS: Record<string, string> = {
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

const LANGUAGE_LABELS: Record<string, string> = {
  JAPANESE: "日本語",
  ENGLISH: "英語",
  KOREAN: "韓国語",
  CHINESE: "中国語",
  OTHER: "その他",
};

interface CardRow {
  tcgTitle: string;
  cardName: string;
  cardNumber: string;
  rarity: string;
  language: CardLanguage;
  declaredValue: number;
  quantity: number;
  notes: string;
}

function newRow(): CardRow {
  return {
    tcgTitle: "",
    cardName: "",
    cardNumber: "",
    rarity: "",
    language: "JAPANESE",
    declaredValue: 0,
    quantity: 1,
    notes: "",
  };
}

export default function StoreInputForm({
  applicationId,
  servicePrices,
}: {
  applicationId: string;
  servicePrices: ServicePrice[];
}) {
  const router = useRouter();
  const [serviceLevel, setServiceLevel] = useState<ServiceLevel>(
    servicePrices[0]?.serviceLevel ?? "REGULAR"
  );
  const [cards, setCards] = useState<CardRow[]>([newRow()]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selected = servicePrices.find((p) => p.serviceLevel === serviceLevel);

  function update<K extends keyof CardRow>(i: number, field: K, value: CardRow[K]) {
    setCards((prev) => prev.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)));
  }

  async function handleSubmit() {
    setError("");
    if (cards.some((c) => !c.tcgTitle || !c.cardName || c.declaredValue < 1)) {
      setError("各カードのTCGタイトル・カード名・申告価格（1円以上）を入力してください");
      return;
    }
    setLoading(true);
    const result = await completeStoreApplication({
      applicationId,
      serviceLevel,
      cards: cards.map((c) => ({
        tcgTitle: c.tcgTitle,
        cardName: c.cardName,
        cardNumber: c.cardNumber || undefined,
        rarity: c.rarity || undefined,
        language: c.language,
        declaredValue: c.declaredValue,
        quantity: c.quantity,
        notes: c.notes || undefined,
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
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-bold text-gray-900 mb-3">サービスレベル</h2>
        <select
          value={serviceLevel}
          onChange={(e) => setServiceLevel(e.target.value as ServiceLevel)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
        >
          {servicePrices.map((p) => (
            <option key={p.id} value={p.serviceLevel}>
              {SERVICE_LABELS[p.serviceLevel] ?? p.serviceLevel}（¥{p.pricePerCard.toLocaleString()}/枚）
              {p.maxDeclaredValue !== null ? ` 上限¥${p.maxDeclaredValue.toLocaleString()}` : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-900">カード明細</h2>
          <button
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
              <select
                value={c.language}
                onChange={(e) => update(i, "language", e.target.value as CardLanguage)}
                className="border border-gray-300 rounded px-3 py-2 text-sm text-gray-900"
              >
                {Object.entries(LANGUAGE_LABELS).map(([v, label]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </select>
              <input
                type="number"
                placeholder="申告価格（円）"
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
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <p className="text-sm text-gray-500">
          ※ 確定すると料金が計算され（手数料あり）、申込が確定します。決済はStripe統合後に通電予定です。
        </p>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full bg-brand-600 text-white font-bold py-3 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition"
      >
        {loading ? "確定中..." : "入力を確定する"}
      </button>
    </div>
  );
}
