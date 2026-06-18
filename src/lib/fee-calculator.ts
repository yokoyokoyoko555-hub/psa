import { prisma } from "./prisma";
import { ServiceLevel, ReturnMethod, ServiceRegion } from "@prisma/client";

const TAX_RATE = 0.1;
const PSA_COST_RATE = 0.8; // 代理店価格: 定価の80%

export interface FeeBreakdown {
  psaFeeTotal: number;
  psaCostTotal: number;
  agencyFeeTotal: number;
  shippingFee: number;
  insuranceFee: number;
  taxAmount: number;
  totalAmount: number;
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
  const [servicePrice, shippingRules, insuranceRules] = await Promise.all([
    prisma.servicePrice.findUnique({
      where: { serviceLevel_region: { serviceLevel: params.serviceLevel, region: params.region } },
    }),
    prisma.shippingRule.findMany({
      where: { returnMethod: params.returnMethod, isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.insuranceRule.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  if (!servicePrice) throw new Error("Service price not found");

  const psaFeeTotal = servicePrice.pricePerCard * params.cardCount;
  const psaCostTotal = Math.floor(psaFeeTotal * PSA_COST_RATE);
  const agencyFeeTotal = params.applyAgencyFee
    ? servicePrice.agencyFee * params.cardCount
    : 0;

  // 送料計算（金額帯ごと）
  const shippingRule = shippingRules.find((r) => {
    const overMin = params.totalDeclaredValue >= r.minAmount;
    const underMax = r.maxAmount === null || params.totalDeclaredValue <= r.maxAmount;
    return overMin && underMax;
  }) ?? shippingRules[shippingRules.length - 1];
  const shippingFee = shippingRule?.fee ?? 0;

  // 保険料計算
  const insuranceRule = insuranceRules.find((r) => {
    const overMin = params.totalDeclaredValue >= r.minValue;
    const underMax = r.maxValue === null || params.totalDeclaredValue <= r.maxValue;
    return overMin && underMax;
  }) ?? insuranceRules[insuranceRules.length - 1];

  let insuranceFee = 0;
  if (insuranceRule) {
    if (insuranceRule.feeRate) {
      insuranceFee = Math.ceil(params.totalDeclaredValue * (insuranceRule.feeRate / 100));
    } else {
      insuranceFee = insuranceRule.fee;
    }
  }

  const subtotal = psaFeeTotal + agencyFeeTotal + shippingFee + insuranceFee;
  const taxAmount = Math.floor(subtotal * TAX_RATE);
  const totalAmount = subtotal + taxAmount;

  return {
    psaFeeTotal,
    psaCostTotal,
    agencyFeeTotal,
    shippingFee,
    insuranceFee,
    taxAmount,
    totalAmount,
  };
}
