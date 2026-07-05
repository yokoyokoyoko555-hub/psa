import type { ServiceRegion, ItemType } from "@prisma/client";

/**
 * リージョン×アイテム種別からPricingSetting.idを決定する（既存2行(id="PSA_JP"/"PSA_US")は
 * 従来通りregion文字列のまま、新規分は"{region}_{itemType}"）。ADR-0023
 *
 * PricingSettingのlookupは常にこのidを主キーとして行うこと（region/itemTypeカラムでの
 * findFirstは使わない）。既存2行はdb push時にregion/itemTypeカラムが同一デフォルト値
 * （両方PSA_JP/TRADING_CARD）になった状態のまま本番で残っており、region/itemTypeカラムで
 * 検索すると一致しない場合がある（ADR-0023追記のインシデント。seed.tsの補正upsertが本番で
 * 自動実行されないため未解消だった）。idベースのupsertなら常に正しく一致し、update時に
 * region/itemTypeも書き戻すことで自己修復する。
 */
export function pricingSettingId(region: ServiceRegion, itemType: ItemType): string {
  return itemType === "TRADING_CARD" ? region : `${region}_${itemType}`;
}
