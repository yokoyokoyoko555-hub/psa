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
 * 簡易ステータス（申込完了→受取完了→発送完了→PSA進捗ステータス）を算出する。
 * PSA提出グループのstatusがPREPARING/SUBMITTED以外（=管理画面で登録したPSA進捗ステータス名）
 * の場合はその名称をそのまま表示する。顧客画面・管理画面で共通のロジックを使う。ADR-0034/0036
 */
export function computeDisplayStatus(app: {
  receivedAt: Date | null;
  psaSubmissionGroup: { status: string; submittedAt: Date | null } | null;
}): string {
  const group = app.psaSubmissionGroup;
  if (group && group.status !== "PREPARING" && group.status !== "SUBMITTED") {
    return group.status;
  }
  if (group && (group.status === "SUBMITTED" || group.submittedAt)) {
    return "発送完了";
  }
  if (app.receivedAt) return "受取完了";
  return "申込完了";
}
