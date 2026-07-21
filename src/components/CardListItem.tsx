"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateCardDetails } from "@/actions/admin";
import { formatMoneyInt } from "@/lib/currency";
import { CARD_DISPLAY_LABELS, buildPsaLine, buildCardTitle } from "@/lib/card-display";
import CopyButton from "@/components/CopyButton";

export type CardListItemData = {
  id: string;
  lineNo: number | null;
  cardNo: string;
  tcgTitle: string;
  releaseYear: string | null;
  cardName: string;
  cardNumber: string | null;
  rarity: string | null;
  language: string;
  declaredValue: number;
  quantity: number;
  autographRequested: boolean;
};

/** 申込詳細のカード1行。表示のほか、入力ミス訂正用に識別情報（タイトル・発行年・カード名・カード番号・レアリティ・言語）をその場で編集できる。 */
export default function CardListItem({
  card,
  itemType,
  region,
}: {
  card: CardListItemData;
  itemType: string;
  region: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const displayLabels = CARD_DISPLAY_LABELS[itemType] ?? CARD_DISPLAY_LABELS.TRADING_CARD;
  const psaLine = buildPsaLine(card, itemType);
  const cardTitle = buildCardTitle(card, itemType);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const result = await updateCardDetails({
        cardId: card.id,
        tcgTitle: fd.get("tcgTitle") as string,
        releaseYear: (fd.get("releaseYear") as string) || undefined,
        cardName: fd.get("cardName") as string,
        cardNumber: (fd.get("cardNumber") as string) || undefined,
        rarity: (fd.get("rarity") as string) || undefined,
        language: fd.get("language") as string,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError("更新に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {card.lineNo != null && (
              <span className="shrink-0 w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-xs font-bold flex items-center justify-center">
                {card.lineNo}
              </span>
            )}
            <span className="font-medium text-gray-900">{cardTitle}</span>
            {card.autographRequested && (
              <span className="text-xs bg-brand-100 text-brand-700 rounded-full px-2 py-0.5">
                🖊 オートグラフ
              </span>
            )}
            {!editing && (
              <>
                {/* PSA提出フォーム向け: 半角スペース区切り1行をコピー */}
                <CopyButton label="行コピー" text={psaLine} />
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="text-xs text-gray-400 hover:text-brand-600 border border-gray-200 rounded px-1.5 py-0.5"
                >
                  編集
                </button>
              </>
            )}
          </div>

          {!editing ? (
            <>
              {/* 顧客入力内容を半角スペース区切り1行で表示（コピー内容と同一） */}
              <p className="mt-1 text-xs font-mono text-gray-700 bg-gray-50 rounded px-2 py-1 break-all">
                {psaLine}
              </p>
              <p className="mt-1 flex gap-3 text-xs text-gray-500">
                <span className="font-mono text-gray-400">{card.cardNo}</span>
                <span>申告額: {formatMoneyInt(card.declaredValue, region)}</span>
                <span>{displayLabels.secondaryLabel}: {card.language}</span>
                <span>{card.quantity}{displayLabels.quantityUnit}</span>
              </p>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="mt-2 space-y-2 bg-gray-50 border border-gray-200 rounded-lg p-3">
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">タイトル</label>
                  <input
                    name="tcgTitle"
                    defaultValue={card.tcgTitle}
                    required
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">{displayLabels.releaseYearLabel}</label>
                  <input
                    name="releaseYear"
                    defaultValue={card.releaseYear ?? ""}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">{displayLabels.nameLabel}</label>
                  <input
                    name="cardName"
                    defaultValue={card.cardName}
                    required
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">{displayLabels.secondaryLabel}</label>
                  <input
                    name="language"
                    defaultValue={card.language}
                    required
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                {displayLabels.showCardNumberRarity && (
                  <>
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">カード番号</label>
                      <input
                        name="cardNumber"
                        defaultValue={card.cardNumber ?? ""}
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">レアリティ</label>
                      <input
                        name="rarity"
                        defaultValue={card.rarity ?? ""}
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-brand-600 text-white text-xs font-bold px-3 py-1.5 rounded hover:bg-brand-700 disabled:opacity-50 transition"
                >
                  {loading ? "保存中..." : "保存"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setError("");
                  }}
                  disabled={loading}
                  className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5"
                >
                  キャンセル
                </button>
              </div>
            </form>
          )}
        </div>
        {!editing && (
          <a
            href={`/api/qrcode?cardId=${card.id}`}
            target="_blank"
            className="shrink-0 text-xs text-brand-600 hover:underline"
          >
            📱 QR印刷
          </a>
        )}
      </div>
    </div>
  );
}
