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
 * 顧客・管理画面共通の「簡易ステータス」固定値。ADR-0034/0036/0045/0052
 * 自己入力(CUSTOMER): DRAFT→APPLIED→RECEIVED→PREPARING_SHIPMENT→SHIPPED→(カスタムのPSA進捗ステータス)→RETURN_PREPARING→RETURNED
 * 代理入力(STORE): APPLIED→INPUT_DONE→PAID→PREPARING_SHIPMENT→SHIPPED→(カスタムのPSA進捗ステータス)→RETURN_PREPARING→RETURNED
 * 代理入力はPREPARING_SHIPMENT（発送準備中）以降、自己入力と完全に同じ扱いに合流する。
 * DRAFTは`computeDisplayStatus()`自体は返さない（呼び出し元がstatus==="DRAFT"を個別に扱う。下書きは
 * 「申込一覧」で別セクション表示されるため）。ここには全体像を示す定数として含める。
 */
export const DISPLAY_STATUS = {
  DRAFT: "下書き", // 自己入力のみ。computeDisplayStatus()は呼ばれず、呼び出し元で個別に扱う
  APPLIED: "申込完了",
  RECEIVED: "受取完了", // 自己入力のみ
  INPUT_DONE: "入力完了", // 代理入力のみ
  PAID: "支払完了", // 代理入力のみ
  PREPARING_SHIPMENT: "発送準備中", // ここから自己入力・代理入力で共通フローに合流
  SHIPPED: "発送完了",
  RETURN_PREPARING: "返送準備中",
  RETURNED: "返送完了",
} as const;

export type FixedDisplayStatus = (typeof DISPLAY_STATUS)[keyof typeof DISPLAY_STATUS];
// カスタムのPSA進捗ステータス名（管理画面で自由入力）も返りうるため、固定値だけに絞り込まない。
export type DisplayStatus = FixedDisplayStatus | (string & {});

/**
 * 簡易ステータスを算出する。最も進んだ状態から順に判定し、該当しなければ手前の状態にフォールバックする。
 * （代理入力は明細入力＝受取を兼ねるため「受取完了」は出さない。この関数はstatusがDRAFTでない前提で呼ぶこと）
 * PSA提出グループのstatusがPREPARING/SUBMITTED以外（=管理画面で登録したPSA進捗ステータス名）
 * の場合はその名称をそのまま表示する。顧客画面・管理画面で共通のロジックを使う。
 */
export function computeDisplayStatus(app: {
  source: string; // "CUSTOMER" | "STORE"
  receivedAt: Date | null;
  psaSubmissionGroup: { status: string; submittedAt: Date | null } | null;
  payments: { status: string }[];
  cards: { status: string }[];
}): DisplayStatus {
  const group = app.psaSubmissionGroup;
  const cards = app.cards;

  // 返送完了・返送準備中: 全カードが返却完了／返却準備中以降の場合のみ（一部混在時は下の判定にフォールバック）
  if (cards.length > 0 && cards.every((c) => c.status === "RETURNED_TO_CUSTOMER")) {
    return DISPLAY_STATUS.RETURNED;
  }
  if (cards.length > 0 && cards.every((c) => c.status === "READY_FOR_CUSTOMER_RETURN" || c.status === "RETURNED_TO_CUSTOMER")) {
    return DISPLAY_STATUS.RETURN_PREPARING;
  }

  // カスタムのPSA進捗ステータス（管理画面「PSA進捗ステータス」で登録した任意の名称）
  if (group && group.status !== "PREPARING" && group.status !== "SUBMITTED") {
    return group.status;
  }
  // 発送完了
  if (group && (group.status === "SUBMITTED" || group.submittedAt)) {
    return DISPLAY_STATUS.SHIPPED;
  }
  // 発送準備中（PSA提出グループ作成済みだが未提出）
  if (group && group.status === "PREPARING") {
    return DISPLAY_STATUS.PREPARING_SHIPMENT;
  }

  if (app.source === "STORE") {
    // 代理入力: 明細入力・確定済み（この関数はDRAFT時は呼ばれない前提）で、確定分請求が未払いなら「入力完了」、
    // 支払い済み（差額なし含む）なら「支払完了」。ADR-0045
    const hasPendingPayment = app.payments.some((p) => p.status === "PENDING");
    return hasPendingPayment ? DISPLAY_STATUS.INPUT_DONE : DISPLAY_STATUS.PAID;
  }
  if (app.receivedAt) return DISPLAY_STATUS.RECEIVED;
  return DISPLAY_STATUS.APPLIED;
}
