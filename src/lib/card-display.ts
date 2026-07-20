// カード情報の表示用ラベル・PSA提出フォーム向け1行整形（管理画面・申込詳細で共通利用）。ADR-0033

// PSA提出フォームは英語1行のため、言語は英語表記でコピーする。
// 自由記述化（ADR-0023）後は代表的な入力のみ変換し、それ以外はそのまま出力する。
// 旧CardLanguage enum値（既存データ）もあわせてマッピング。
export const LANGUAGE_PSA: Record<string, string> = {
  日本語: "Japanese",
  英語: "English",
  韓国語: "Korean",
  中国語: "Chinese",
  その他: "Other",
  JAPANESE: "Japanese",
  ENGLISH: "English",
  KOREAN: "Korean",
  CHINESE: "Chinese",
  OTHER: "Other",
};

// アイテム種別ごとの表示ラベル切替（入力フォームの CARD_FIELD_LABELS と同じ考え方の表示・編集専用版）。ADR-0033
export const CARD_DISPLAY_LABELS: Record<
  string,
  {
    entryLabel: string;
    secondaryLabel: string;
    quantityUnit: string;
    nameLabel: string;
    releaseYearLabel: string;
    showCardNumberRarity: boolean;
  }
> = {
  TRADING_CARD: {
    entryLabel: "カード",
    secondaryLabel: "言語",
    quantityUnit: "枚",
    nameLabel: "カード名",
    releaseYearLabel: "発行年",
    showCardNumberRarity: true,
  },
  UNOPENED_PACK: {
    entryLabel: "パック",
    secondaryLabel: "言語",
    quantityUnit: "枚",
    nameLabel: "パック名",
    releaseYearLabel: "発行年",
    showCardNumberRarity: false,
  },
  COMIC_MAGAZINE: {
    entryLabel: "コミック／マガジン",
    secondaryLabel: "出版社",
    quantityUnit: "冊",
    nameLabel: "巻数・号",
    releaseYearLabel: "発行年月",
    showCardNumberRarity: false,
  },
};

/**
 * PSA提出フォーム向け1行（発行年 タイトル 言語(英語)/出版社 カード番号／型番 カード名 レアリティ・半角スペース区切り）。
 * トレカ以外はcardNumber/rarityが空文字のためfilterで自然に除外される。
 */
export function buildPsaLine(
  card: {
    releaseYear: string | null;
    tcgTitle: string;
    language: string;
    cardNumber: string | null;
    cardName: string;
    rarity: string | null;
  },
  itemType: string
): string {
  return [
    card.releaseYear ?? "",
    card.tcgTitle,
    itemType === "TRADING_CARD" ? LANGUAGE_PSA[card.language] ?? card.language : card.language,
    card.cardNumber ?? "",
    card.cardName,
    card.rarity ?? "",
  ]
    .filter((v) => v !== "" && v != null)
    .join(" ");
}
