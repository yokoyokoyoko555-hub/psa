import { prisma } from "./prisma";
import { ServiceLevel, ReturnMethod, ServiceRegion } from "@prisma/client";

const TAX_RATE = 0.1;
const PSA_COST_RATE = 0.8; // 代理店価格: 定価の80%

export interface FeeBreakdown {
  psaFeeTotal: number;
  psaCostTotal: number;
  agencyFeeTotal: number; // 代理入力料金（STORE時のみ）
  shippingFee: number; // PSA_JPでは「送料・保険」合算額をここに入れる
  insuranceFee: number; // PSA_JPでは0（合算のため）
  handlingFee: number; // 事務手数料（申込あたり）
  taxAmount: number;
  totalAmount: number;
}

/**
 * PSA日本: 送料・保険 合算マトリクスから金額を求める（26+は基準額+加算単価×(枚数-25)）。
 * マトリクス未投入(行が無い)時は null を返し、呼び出し側で従来ロジックにフォールバックする。
 */
async function calcShippingInsuranceJp(totalDeclaredValue: number, cardCount: number): Promise<number | null> {
  const rates = await prisma.shippingInsuranceRate.findMany({
    where: { region: "PSA_JP", isActive: true },
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
  totalDeclaredValue: number;
}): Promise<number> {
  const [shippingRules, insuranceRules] = await Promise.all([
    prisma.shippingRule.findMany({ where: { returnMethod: params.returnMethod, isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.insuranceRule.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
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
  serviceLevel: ServiceLevel;
  region: ServiceRegion;
  returnMethod: ReturnMethod;
  cardCount: number;
  totalDeclaredValue: number;
  /** 代行手数料を加算するか（当社入力=true / 顧客入力=false） */
  applyAgencyFee: boolean;
}): Promise<FeeBreakdown> {
  const servicePrice = await prisma.servicePrice.findUnique({
    where: { serviceLevel_region: { serviceLevel: params.serviceLevel, region: params.region } },
  });
  if (!servicePrice) throw new Error("Service price not found");

  const psaFeeTotal = servicePrice.pricePerCard * params.cardCount;
  const psaCostTotal = Math.floor(psaFeeTotal * PSA_COST_RATE);
  const agencyFeeTotal = params.applyAgencyFee ? servicePrice.agencyFee * params.cardCount : 0;
  const handlingFee = servicePrice.handlingFee;

  // 送料・保険: PSA日本は合算マトリクス（未投入時は従来ロジックにフォールバック）、USは従来ロジック
  const legacy = () => calcShippingInsuranceLegacy({ returnMethod: params.returnMethod, totalDeclaredValue: params.totalDeclaredValue });
  let shippingInsurance: number;
  if (params.region === "PSA_JP") {
    const matrix = await calcShippingInsuranceJp(params.totalDeclaredValue, params.cardCount);
    shippingInsurance = matrix ?? (await legacy());
  } else {
    shippingInsurance = await legacy();
  }

  const subtotal = psaFeeTotal + agencyFeeTotal + shippingInsurance + handlingFee;
  const taxAmount = Math.floor(subtotal * TAX_RATE);
  const totalAmount = subtotal + taxAmount;

  return {
    psaFeeTotal,
    psaCostTotal,
    agencyFeeTotal,
    shippingFee: shippingInsurance,
    insuranceFee: 0,
    handlingFee,
    taxAmount,
    totalAmount,
  };
}
