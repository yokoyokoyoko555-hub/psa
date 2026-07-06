import { prisma } from "./prisma";
import { ReturnMethod, ServiceRegion, ItemType } from "@prisma/client";
import { roundMoney, effectiveUsdJpyRate } from "./currency";
import { pricingSettingId } from "./pricing-setting-id";

const TAX_RATE = 0.1;
const PSA_COST_RATE = 0.8; // 代理店価格: 定価の80%
const EXCHANGE_RATE_ID = "default";

export interface FeeBreakdown {
  /** 表示用の鑑定料合計（JP=円 / US=USD、換算前の生値）。決済額の計算には使わない。ADR-0031 */
  psaFeeTotal: number;
  psaCostTotal: number;
  /** 常に0固定（互換のため残置）。デュアルサービスは通常サービスレベルの代わりに選ぶ形式に変更し、
   * 追加料金としては加算しない（psaFeeTotal自体がデュアルサービスタイアの価格になる）。ADR-0029 */
  autographFeeTotal: number;
  autographCostTotal: number;
  agencyFeeTotal: number; // 代理入力料金（STORE時のみ）
  shippingFee: number; // 「送料・保険」合算額をここに入れる
  insuranceFee: number; // 0（合算のため）
  handlingFee: number; // 事務手数料
  discountAmount: number; // キャンペーン割引（鑑定料以外に適用・正の値）
  campaignName: string | null;
  taxAmount: number; // 常に円（内税の内訳額）。ADR-0031
  totalAmount: number; // 常に円。Stripe決済もこの金額をJPYで実行する。ADR-0031
  /** PSA US決済時に使用した実効為替レート（USD→JPY、マージン込み）。PSA_JPはnull。ADR-0031 */
  exchangeRateUsed: number | null;
}

/** 有効・期間内・条件一致のキャンペーンを1件返す（startAt新しい順で先頭） */
async function findCampaign(region: ServiceRegion, customerId?: string) {
  const now = new Date();
  const campaigns = await prisma.campaign.findMany({
    where: {
      isActive: true,
      startAt: { lte: now },
      endAt: { gte: now },
      OR: [{ region: null }, { region }],
    },
    orderBy: { startAt: "desc" },
  });
  for (const c of campaigns) {
    if (c.newCustomerOnly) {
      if (!customerId) continue;
      const prior = await prisma.application.count({
        where: { customerId, status: { notIn: ["DRAFT", "CANCELLED"] } },
      });
      if (prior > 0) continue;
    }
    return c;
  }
  return null;
}

/**
 * 送料・保険 合算マトリクスから金額を求める（26+は基準額+加算単価×(枚数-25)）。リージョン別。
 * マトリクス未投入(行が無い)時は null を返し、呼び出し側で従来ロジックにフォールバックする。
 */
async function calcShippingInsuranceMatrix(
  region: ServiceRegion,
  itemType: ItemType,
  totalDeclaredValue: number,
  cardCount: number,
): Promise<number | null> {
  const rates = await prisma.shippingInsuranceRate.findMany({
    where: { region, itemType, isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  if (rates.length === 0) return null; // 未設定 → フォールバック
  const row = rates.find((r) => {
    const inValue = totalDeclaredValue >= r.minValue && (r.maxValue === null || totalDeclaredValue <= r.maxValue);
    const inQty = cardCount >= r.qtyMin && (r.qtyMax === null || cardCount <= r.qtyMax);
    return inValue && inQty;
  });
  if (!row) return 0;
  if (row.perCardSurcharge > 0) {
    const over = Math.max(0, cardCount - 25);
    return row.fee + row.perCardSurcharge * over;
  }
  return row.fee;
}

/** PSA US（据え置き）: 従来の ShippingRule / InsuranceRule から算出 */
async function calcShippingInsuranceLegacy(params: {
  returnMethod: ReturnMethod;
  itemType: ItemType;
  totalDeclaredValue: number;
}): Promise<number> {
  const [shippingRules, insuranceRules] = await Promise.all([
    prisma.shippingRule.findMany({ where: { returnMethod: params.returnMethod, itemType: params.itemType, isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.insuranceRule.findMany({ where: { itemType: params.itemType, isActive: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  const shippingRule =
    shippingRules.find((r) => {
      const overMin = params.totalDeclaredValue >= r.minAmount;
      const underMax = r.maxAmount === null || params.totalDeclaredValue <= r.maxAmount;
      return overMin && underMax;
    }) ?? shippingRules[shippingRules.length - 1];
  const shippingFee = shippingRule?.fee ?? 0;

  const insuranceRule =
    insuranceRules.find((r) => {
      const overMin = params.totalDeclaredValue >= r.minValue;
      const underMax = r.maxValue === null || params.totalDeclaredValue <= r.maxValue;
      return overMin && underMax;
    }) ?? insuranceRules[insuranceRules.length - 1];

  let insuranceFee = 0;
  if (insuranceRule) {
    insuranceFee = insuranceRule.feeRate
      ? Math.ceil(params.totalDeclaredValue * (insuranceRule.feeRate / 100))
      : insuranceRule.fee;
  }
  return shippingFee + insuranceFee;
}

export async function calculateFees(params: {
  region: ServiceRegion;
  /** 鑑定対象アイテム種別（PSA_USのみ複数）。ADR-0023 */
  itemType: ItemType;
  /** 選択したCustomServicePrice.id（category=itemType）。全itemTypeで必須。ADR-0025/0026 */
  customServiceLevelId: string;
  returnMethod: ReturnMethod;
  cardCount: number;
  totalDeclaredValue: number;
  /** 代行手数料を加算するか（当社入力=true / 顧客入力=false） */
  applyAgencyFee: boolean;
  /**
   * 代理入力料金を「カードの種類数 × 手数料」で課金する場合の種類数（同一カードは何枚でも1種）。
   * 未指定なら従来どおり cardCount（枚数）ベース。後方互換のため任意。[ADR-0020 / PROXY_PREPAY]
   */
  agencyCardTypeCount?: number;
  /** 新規(初回)限定キャンペーンの判定に使用（任意） */
  customerId?: string;
}): Promise<FeeBreakdown> {
  // トレーディングカードを含む全itemTypeがCustomServicePriceを参照する（ADR-0026）。
  // PSA_US×TRADING_CARDのみ、通常タイア(category=itemType)に加えてデュアルサービスタイア
  // (category=AUTOGRAPH)も選択可能（通常サービスの代わりに選ぶ形式・加算はしない）。ADR-0029
  const categoryCandidates: ("TRADING_CARD" | "UNOPENED_PACK" | "COMIC_MAGAZINE" | "AUTOGRAPH")[] =
    params.itemType === "TRADING_CARD" && params.region === "PSA_US"
      ? ["TRADING_CARD", "AUTOGRAPH"]
      : [params.itemType];
  const customPrice = await prisma.customServicePrice.findFirst({
    where: {
      id: params.customServiceLevelId,
      category: { in: categoryCandidates },
      region: params.region,
      isActive: true,
    },
  });
  if (!customPrice) throw new Error("Custom service price not found");
  const pricePerCard = customPrice.pricePerCard;
  // 原価: 明示設定があればそれを、未設定(0)なら鑑定料×80%で代替
  const perCardCost =
    customPrice.cost > 0 ? customPrice.cost : roundMoney(customPrice.pricePerCard * PSA_COST_RATE, params.region);
  const psaFeeTotal = pricePerCard * params.cardCount;
  const psaCostTotal = perCardCost * params.cardCount;

  const setting = await prisma.pricingSetting.findUnique({
    where: { id: pricingSettingId(params.region, params.itemType) },
  });

  // デュアルサービスは通常サービスの代わりに選ぶ形式のため、追加料金は発生しない（常に0）。ADR-0029
  const autographFeeTotal = 0;
  const autographCostTotal = 0;

  // 代理入力料金: リージョン別の一律額 × 種類数（同一カードは何枚でも1種）。
  // 種類数(agencyCardTypeCount)未指定なら従来どおり枚数(cardCount)で算出（後方互換）。代理入力(STORE)時のみ。
  const agencyUnits = params.agencyCardTypeCount ?? params.cardCount;
  const agencyFeeTotal = params.applyAgencyFee ? (setting?.proxyFee ?? 0) * agencyUnits : 0;
  // 事務手数料: リージョン別の一律額。1申込（サービスレベル選択）につき1回のみ発生（枚数に関わらず一律）。ADR-0030
  const handlingFee = setting?.handlingFee ?? 0;

  // 送料・保険: リージョン別の合算マトリクス（未投入時は従来ロジックにフォールバック）
  const matrix = await calcShippingInsuranceMatrix(params.region, params.itemType, params.totalDeclaredValue, params.cardCount);
  let shippingInsurance =
    matrix ??
    (await calcShippingInsuranceLegacy({
      returnMethod: params.returnMethod,
      itemType: params.itemType,
      totalDeclaredValue: params.totalDeclaredValue,
    }));
  // N枚以上で送料・保険を無料化（リージョン別しきい値・0=無効）
  const freeQty = setting?.freeShipInsQty ?? 0;
  if (freeQty > 0 && params.cardCount >= freeQty) shippingInsurance = 0;

  // キャンペーン割引: 「鑑定料以外」（代理入力料金＋送料保険＋事務手数料。常に円）を対象。鑑定料・オートグラフ料金は対象外。
  const discountBase = agencyFeeTotal + shippingInsurance + handlingFee;
  const campaign = await findCampaign(params.region, params.customerId);
  let discountAmount = 0;
  if (campaign) {
    discountAmount =
      campaign.discountType === "PERCENT"
        ? Math.floor((discountBase * Math.min(100, Math.max(0, campaign.value))) / 100)
        : campaign.value;
    discountAmount = Math.min(discountAmount, discountBase); // 対象ベースを上限
  }

  // PSA USは鑑定料(USD)を決済用にJPYへ換算する。表示用のpsaFeeTotalは換算前の生値のまま返す。ADR-0031
  let exchangeRateUsed: number | null = null;
  let psaFeeTotalJpy = psaFeeTotal;
  if (params.region === "PSA_US") {
    const rate = await prisma.exchangeRate.findUnique({ where: { id: EXCHANGE_RATE_ID } });
    if (!rate) throw new Error("為替レートが設定されていません。管理画面で設定してください。");
    exchangeRateUsed = effectiveUsdJpyRate(rate.usdJpyRate, rate.marginPercent);
    psaFeeTotalJpy = Math.round(psaFeeTotal * exchangeRateUsed);
  }

  // 料金表（鑑定料・代理入力料金・事務手数料・送料保険料）は全て税込みで設定されているため、
  // 合計は単純合計のみとし、消費税を追加で加算しない。内消費税は合計から逆算（内税抽出）する。ADR-0032
  const subtotal = psaFeeTotalJpy + autographFeeTotal + discountBase - discountAmount;
  const totalAmount = roundMoney(subtotal, "PSA_JP");
  const taxAmount = totalAmount - Math.floor(totalAmount / (1 + TAX_RATE));

  return {
    psaFeeTotal,
    psaCostTotal,
    autographFeeTotal,
    autographCostTotal,
    agencyFeeTotal,
    shippingFee: shippingInsurance,
    insuranceFee: 0,
    handlingFee,
    discountAmount,
    campaignName: campaign && discountAmount > 0 ? campaign.name : null,
    taxAmount,
    totalAmount,
    exchangeRateUsed,
  };
}
