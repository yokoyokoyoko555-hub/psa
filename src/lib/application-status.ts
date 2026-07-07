// 申込の表示用ラベル・簡易ステータス算出（顧客画面・管理画面で共通利用）。ADR-0034/0036

export const SERVICE_LABELS: Record<string, string> = {
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

export const REGION_LABELS: Record<string, string> = {
  PSA_JP: "PSA 日本",
  PSA_US: "PSA US",
};

export const ITEM_TYPE_LABELS: Record<string, string> = {
  TRADING_CARD: "トレーディングカード",
  UNOPENED_PACK: "未開封パック",
  COMIC_MAGAZINE: "コミック・マガジン",
};

/**
 * サービスレベルは動的タイア（CustomServicePrice）のスナップショット名を優先し、
 * 未選択（代理入力の明細入力待ちなど）の場合のみ「未選択」とする。ADR-0026以降serviceLevelは常に"CUSTOM"のため。
 */
export function resolveServiceLevel(app: { serviceLevel: string; customServiceLevelName: string | null }): string {
  return (
    app.customServiceLevelName ??
    SERVICE_LABELS[app.serviceLevel] ??
    (app.serviceLevel === "CUSTOM" ? "未選択" : app.serviceLevel)
  );
}

/**
 * 簡易ステータスを算出する。最も進んだ状態から順に判定し、該当しなければ手前の状態にフォールバックする。
 * 自己入力(CUSTOMER): 申込完了→受取完了→発送準備中→発送完了→カスタムのPSA進捗ステータス→返送準備中→返送完了
 * 代理入力(STORE): 申込完了→入力完了→支払完了→発送準備中→発送完了→カスタムのPSA進捗ステータス→返送準備中→返送完了
 * （代理入力は明細入力＝受取を兼ねるため「受取完了」は出さない。この関数はstatusがDRAFTでない前提で呼ぶこと）
 * PSA提出グループのstatusがPREPARING/SUBMITTED以外（=管理画面で登録したPSA進捗ステータス名）
 * の場合はその名称をそのまま表示する。顧客画面・管理画面で共通のロジックを使う。ADR-0034/0036/0045
 */
export function computeDisplayStatus(app: {
  source: string; // "CUSTOMER" | "STORE"
  receivedAt: Date | null;
  psaSubmissionGroup: { status: string; submittedAt: Date | null } | null;
  payments: { status: string }[];
  cards: { status: string }[];
}): string {
  const group = app.psaSubmissionGroup;
  const cards = app.cards;

  // 返送完了・返送準備中: 全カードが返却完了／返却準備中以降の場合のみ（一部混在時は下の判定にフォールバック）
  if (cards.length > 0 && cards.every((c) => c.status === "RETURNED_TO_CUSTOMER")) {
    return "返送完了";
  }
  if (cards.length > 0 && cards.every((c) => c.status === "READY_FOR_CUSTOMER_RETURN" || c.status === "RETURNED_TO_CUSTOMER")) {
    return "返送準備中";
  }

  // カスタムのPSA進捗ステータス（管理画面「PSA進捗ステータス」で登録した任意の名称）
  if (group && group.status !== "PREPARING" && group.status !== "SUBMITTED") {
    return group.status;
  }
  // 発送完了
  if (group && (group.status === "SUBMITTED" || group.submittedAt)) {
    return "発送完了";
  }
  // 発送準備中（PSA提出グループ作成済みだが未提出）
  if (group && group.status === "PREPARING") {
    return "発送準備中";
  }

  if (app.source === "STORE") {
    // 代理入力: 明細入力・確定済み（この関数はDRAFT時は呼ばれない前提）で、確定分請求が未払いなら「入力完了」、
    // 支払い済み（差額なし含む）なら「支払完了」。ADR-0045
    const hasPendingPayment = app.payments.some((p) => p.status === "PENDING");
    return hasPendingPayment ? "入力完了" : "支払完了";
  }
  if (app.receivedAt) return "受取完了";
  return "申込完了";
}
