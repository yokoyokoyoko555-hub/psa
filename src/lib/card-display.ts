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
 * カード一覧の見出しに表示するタイトル。コミック・マガジンは巻数・号（cardName）だけでは
 * 何のタイトルの号か分からないため、出版社・タイトル・巻数号を並べて表示する。それ以外は
 * cardNameのみ（カード名／パック名としてそれ単体で意味が通るため）。
 */
export function buildCardTitle(
  card: { tcgTitle: string; cardName: string; language: string },
  itemType: string
): string {
  if (itemType === "COMIC_MAGAZINE") {
    return `${card.language} ${card.tcgTitle} ${card.cardName}`;
  }
  return card.cardName;
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthDayYear(match: RegExpMatchArray | null): string | null {
  if (!match) return null;
  const [, year, month, day] = match;
  const monthIndex = parseInt(month, 10) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  const label = MONTH_ABBR[monthIndex];
  return day ? `${label} ${parseInt(day, 10)}, ${year}` : `${label} ${year}`;
}

/**
 * コミック・マガジンの発行年月は顧客が「2022年5月」「2022.5.1」「2022/5」のように自由記述で入力するため、
 * PSA提出フォーム（英語）向けに英語月名の略称表記（例: "May 2022" "May 1, 2022"）へ変換する。
 * 該当しない形式（既に数字のみ等）はそのまま返す。
 */
function formatReleaseYearForPsa(value: string): string {
  const trimmed = value.trim();
  const result =
    monthDayYear(trimmed.match(/^(\d{4})年(\d{1,2})月(?:(\d{1,2})日)?$/)) ??
    monthDayYear(trimmed.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/)) ??
    monthDayYear(trimmed.match(/^(\d{4})[./-](\d{1,2})$/));
  if (result) return result;
  const yearOnly = trimmed.match(/^(\d{4})年$/);
  if (yearOnly) return yearOnly[1];
  return value;
}

/**
 * コミック・マガジンの巻数・号は顧客が「115巻」「3号」のように助数詞つきで入力することがあるため、
 * PSA提出フォーム向けに数字部分のみへ変換する。該当しない形式（助数詞なし・数字以外を含む等）はそのまま返す。
 */
function formatComicIssueForPsa(value: string): string {
  const match = value.trim().match(/^(\d+)\s*[巻号冊]$/);
  return match ? match[1] : value;
}

// ひらがな・カタカナ→ヘボン式ローマ字の対応表（拗音・現代的な外来語表記も含む）。漢字は読みを
// 一意に特定できないため変換しない。あくまで機械的な簡易変換（PSA提出フォーム用の補助表記）で、
// 正式な英語タイトルと異なる場合がある前提。誤りは管理画面で個別に修正する。
const KANA_ROMAJI: Record<string, string> = {};
{
  const GOJUON: [string, string[]][] = [
    ["", ["あ", "い", "う", "え", "お"]],
    ["k", ["か", "き", "く", "け", "こ"]],
    ["s", ["さ", "し", "す", "せ", "そ"]],
    ["t", ["た", "ち", "つ", "て", "と"]],
    ["n", ["な", "に", "ぬ", "ね", "の"]],
    ["h", ["は", "ひ", "ふ", "へ", "ほ"]],
    ["m", ["ま", "み", "む", "め", "も"]],
    ["y", ["や", "", "ゆ", "", "よ"]],
    ["r", ["ら", "り", "る", "れ", "ろ"]],
    ["w", ["わ", "", "", "", "を"]],
    ["g", ["が", "ぎ", "ぐ", "げ", "ご"]],
    ["z", ["ざ", "じ", "ず", "ぜ", "ぞ"]],
    ["d", ["だ", "ぢ", "づ", "で", "ど"]],
    ["b", ["ば", "び", "ぶ", "べ", "ぼ"]],
    ["p", ["ぱ", "ぴ", "ぷ", "ぺ", "ぽ"]],
  ];
  const VOWELS = ["a", "i", "u", "e", "o"];
  const HIRA_TO_KATA_OFFSET = 0x30a1 - 0x3041;
  const EXCEPTIONS: Record<string, string> = {
    し: "shi",
    ち: "chi",
    つ: "tsu",
    ふ: "fu",
    じ: "ji",
    ぢ: "ji",
    づ: "zu",
  };
  const toKatakana = (hira: string) =>
    Array.from(hira)
      .map((c) => String.fromCodePoint(c.codePointAt(0)! + HIRA_TO_KATA_OFFSET))
      .join("");
  const register = (hira: string, romaji: string) => {
    KANA_ROMAJI[hira] = romaji;
    KANA_ROMAJI[toKatakana(hira)] = romaji;
  };
  for (const [consonant, kana] of GOJUON) {
    kana.forEach((k, i) => {
      if (!k) return;
      register(k, EXCEPTIONS[k] ?? consonant + VOWELS[i]);
    });
  }
  register("ん", "n");
  // 拗音（きゃ・しゅ・ちょ 等）
  const YOON_BASE: [string, string][] = [
    ["き", "ky"], ["し", "sh"], ["ち", "ch"], ["に", "ny"], ["ひ", "hy"], ["み", "my"], ["り", "ry"],
    ["ぎ", "gy"], ["じ", "j"], ["び", "by"], ["ぴ", "py"],
  ];
  const SMALL_Y: [string, string][] = [["ゃ", "a"], ["ゅ", "u"], ["ょ", "o"]];
  for (const [base, prefix] of YOON_BASE) {
    for (const [small, vowel] of SMALL_Y) register(base + small, prefix + vowel);
  }
  // 現代的な外来語表記（ファ・ティ・チェ 等、伝統的な五十音表には無い組み合わせ）
  const MODERN_COMBOS: [string, string][] = [
    ["ふぁ", "fa"], ["ふぃ", "fi"], ["ふぇ", "fe"], ["ふぉ", "fo"],
    ["てぃ", "ti"], ["でぃ", "di"], ["とぅ", "tu"], ["どぅ", "du"],
    ["うぃ", "wi"], ["うぇ", "we"], ["うぉ", "wo"],
    ["ちぇ", "che"], ["しぇ", "she"], ["じぇ", "je"],
    ["つぁ", "tsa"], ["つぇ", "tse"], ["つぉ", "tso"],
    ["ゔぁ", "va"], ["ゔぃ", "vi"], ["ゔ", "vu"], ["ゔぇ", "ve"], ["ゔぉ", "vo"],
  ];
  for (const [hira, romaji] of MODERN_COMBOS) register(hira, romaji);
}

/**
 * ひらがな・カタカナをヘボン式ローマ字へ機械的に変換する（漢字はそのまま）。長音符「ー」は直前の
 * 母音を伸ばし、促音「っ／ッ」は次の子音を重ねる。PSA US提出フォーム向けの簡易な自動変換（補助表記）で、
 * 公式の英語タイトルと一致するとは限らない。誤りはスタッフが個別に修正する前提。
 */
function kanaToRomaji(value: string): string {
  const chars = Array.from(value);
  let result = "";
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const two = ch + (chars[i + 1] ?? "");
    if (ch === "ー") {
      const lastVowel = [...result].reverse().find((c) => "aiueo".includes(c));
      if (lastVowel) result += lastVowel;
      continue;
    }
    if (ch === "っ" || ch === "ッ") {
      const nextRomaji = KANA_ROMAJI[chars[i + 1] + (chars[i + 2] ?? "")] ?? KANA_ROMAJI[chars[i + 1] ?? ""];
      if (nextRomaji && /^[a-z]/.test(nextRomaji)) result += nextRomaji[0];
      continue;
    }
    if (KANA_ROMAJI[two]) {
      result += KANA_ROMAJI[two];
      i++;
      continue;
    }
    result += KANA_ROMAJI[ch] ?? ch;
  }
  return result;
}

// 主要な出版社名→英語社名（部分一致で判定。レーベル名が付いていても対応できるよう包含判定にする）。
const PUBLISHER_EN: Record<string, string> = {
  集英社: "Shueisha",
  講談社: "Kodansha",
  小学館: "Shogakukan",
  角川書店: "Kadokawa Shoten",
  KADOKAWA: "KADOKAWA",
  秋田書店: "Akita Shoten",
  双葉社: "Futabasha",
  白泉社: "Hakusensha",
  少年画報社: "Shonen Gahosha",
  スクウェア・エニックス: "Square Enix",
  一迅社: "Ichijinsha",
  芳文社: "Houbunsha",
  竹書房: "Takeshobo",
  マッグガーデン: "Mag Garden",
  新潮社: "Shinchosha",
  リイド社: "Leed",
};

// PSAで提出頻度の高い主要タイトルの正式英語表記（ワンピース→One Piece 等）。カタカナの
// ローマ字直訳では原題（英語の外来語をカタカナ表記しているだけの場合や、漢字タイトルの場合）に
// 一致しないため、辞書で優先的に変換する。辞書に無いタイトルはローマ字への機械変換にフォールバックする。
const TITLE_EN: Record<string, string> = {
  ワンピース: "One Piece",
  チェンソーマン: "Chainsaw Man",
  ナルト: "Naruto",
  ドラゴンボール: "Dragon Ball",
  スパイファミリー: "Spy x Family",
  東京卍リベンジャーズ: "Tokyo Revengers",
  僕のヒーローアカデミア: "My Hero Academia",
  進撃の巨人: "Attack on Titan",
  ブリーチ: "Bleach",
  デスノート: "Death Note",
  ハンターハンター: "Hunter x Hunter",
  鋼の錬金術師: "Fullmetal Alchemist",
  フェアリーテイル: "Fairy Tail",
  ブラッククローバー: "Black Clover",
  ハイキュー: "Haikyu!!",
  ドクターストーン: "Dr. Stone",
  ワンパンマン: "One Punch Man",
  ヴィンランド・サガ: "Vinland Saga",
  ジョジョの奇妙な冒険: "JoJo's Bizarre Adventure",
  キングダム: "Kingdom",
  呪術廻戦: "Jujutsu Kaisen",
  鬼滅の刃: "Demon Slayer",
  約束のネバーランド: "The Promised Neverland",
  暗殺教室: "Assassination Classroom",
  銀魂: "Gintama",
  ブラックバトラー: "Black Butler",
  東京喰種: "Tokyo Ghoul",
  遊戯王: "Yu-Gi-Oh!",
  ポケットモンスター: "Pokémon",
};

/** コミック・マガジンのタイトルをPSA提出フォーム向けの英語表記へ変換する。主要タイトルは辞書で
 * 変換し（原題が英語の外来語カタカナ表記の場合や漢字タイトルにも対応）、未知の場合はローマ字への
 * 機械変換にフォールバックする。 */
function formatTitleForPsa(value: string): string {
  const trimmed = value.trim();
  const known = TITLE_EN[trimmed] ?? Object.entries(TITLE_EN).find(([ja]) => trimmed.includes(ja))?.[1];
  return known ?? kanaToRomaji(trimmed);
}

/** コミック・マガジンの出版社（language欄を流用）をPSA提出フォーム向けの英語社名へ変換する。既知の
 * 出版社（レーベル名付きの部分一致含む）は辞書で変換し、未知の場合はローマ字への機械変換にフォールバックする。 */
function formatPublisherForPsa(value: string): string {
  const trimmed = value.trim();
  const known = Object.entries(PUBLISHER_EN).find(([ja]) => trimmed.includes(ja));
  return known ? known[1] : kanaToRomaji(trimmed);
}

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
  const isComic = itemType === "COMIC_MAGAZINE";
  const releaseYear = isComic && card.releaseYear ? formatReleaseYearForPsa(card.releaseYear) : card.releaseYear ?? "";
  const cardName = isComic ? formatComicIssueForPsa(card.cardName) : card.cardName;
  const tcgTitle = isComic ? formatTitleForPsa(card.tcgTitle) : card.tcgTitle;
  const secondary = isComic
    ? formatPublisherForPsa(card.language)
    : itemType === "TRADING_CARD"
      ? LANGUAGE_PSA[card.language] ?? card.language
      : card.language;
  return [
    releaseYear,
    tcgTitle,
    secondary,
    card.cardNumber ?? "",
    cardName,
    card.rarity ?? "",
  ]
    .filter((v) => v !== "" && v != null)
    .join(" ");
}

/**
 * 日本語（ひらがな・カタカナ・漢字）を含むかどうかを判定する。buildPsaLineの機械変換（辞書・ローマ字化）
 * で変換しきれず日本語が残った行を検出し、管理画面でハイライト表示するために使う。
 */
export function containsJapanese(value: string): boolean {
  return /[぀-ヿ㐀-䶿一-鿿豈-﫿ｦ-ﾟ]/.test(value);
}
