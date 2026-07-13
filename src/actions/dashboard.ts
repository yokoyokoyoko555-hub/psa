"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import type { ServiceRegion } from "@prisma/client";

async function requireAdminOrStaff() {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id) throw new Error("Unauthorized");
  if (!["ADMIN", "STAFF"].includes(user.role ?? "")) throw new Error("Forbidden");
  return { id: user.id, role: user.role };
}

const DEFAULT_USD_JPY_RATE = 150;

type AppForMetrics = {
  totalAmount: number;
  region: ServiceRegion;
  source: string;
  submittedAt: Date | null;
  exchangeRateUsed: number | null;
  cards: { psaCost: number }[];
};

// PSA原価（Card.psaCost）はJP=円/US=USDの生値のため、US分は申込時点の為替レートで円換算する。ADR-0022/0073
function costJpy(app: AppForMetrics): number {
  const rawCost = app.cards.reduce((sum, c) => sum + c.psaCost, 0);
  return app.region === "PSA_US" ? rawCost * (app.exchangeRateUsed ?? DEFAULT_USD_JPY_RATE) : rawCost;
}

function emptyBucket() {
  return { revenue: 0, count: 0, regionJP: 0, regionUS: 0, sourceCustomer: 0, sourceStore: 0 };
}

/**
 * ダッシュボードの月次サマリー（KPI・日別推移・提出先/入力経路の内訳）を返す。ADR-0073
 * 対象は「受注が確定した」申込（下書き・キャンセルを除く）。日付は`submittedAt`（提出＝確定日）を使う。
 */
export async function getDashboardMetrics(year: number, month: number) {
  await requireAdminOrStaff();

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);
  const prevMonthStart = new Date(year, month - 2, 1);
  const prevMonthEnd = monthStart;
  const daysInMonth = new Date(year, month, 0).getDate();

  const select = {
    totalAmount: true,
    region: true,
    source: true,
    submittedAt: true,
    exchangeRateUsed: true,
    cards: { select: { psaCost: true } },
  } as const;

  const [current, previous] = await Promise.all([
    prisma.application.findMany({
      where: { status: { notIn: ["DRAFT", "CANCELLED"] }, submittedAt: { gte: monthStart, lt: monthEnd } },
      select,
    }),
    prisma.application.findMany({
      where: { status: { notIn: ["DRAFT", "CANCELLED"] }, submittedAt: { gte: prevMonthStart, lt: prevMonthEnd } },
      select,
    }),
  ]);

  const daily = Array.from({ length: daysInMonth }, () => emptyBucket());
  let revenue = 0;
  let cost = 0;
  let regionJP = 0;
  let regionUS = 0;
  let sourceCustomer = 0;
  let sourceStore = 0;

  for (const app of current) {
    const day = app.submittedAt!.getDate();
    const bucket = daily[day - 1];
    bucket.revenue += app.totalAmount;
    bucket.count += 1;
    revenue += app.totalAmount;
    cost += costJpy(app);
    if (app.region === "PSA_US") {
      bucket.regionUS += 1;
      regionUS += 1;
    } else {
      bucket.regionJP += 1;
      regionJP += 1;
    }
    if (app.source === "STORE") {
      bucket.sourceStore += 1;
      sourceStore += 1;
    } else {
      bucket.sourceCustomer += 1;
      sourceCustomer += 1;
    }
  }

  const prevRevenue = previous.reduce((sum, a) => sum + a.totalAmount, 0);
  const prevCost = previous.reduce((sum, a) => sum + costJpy(a), 0);
  const count = current.length;
  const prevCount = previous.length;
  const profit = revenue - cost;
  const prevProfit = prevRevenue - prevCost;
  const avgOrderValue = count > 0 ? revenue / count : 0;
  const prevAvgOrderValue = prevCount > 0 ? prevRevenue / prevCount : 0;

  return {
    year,
    month,
    kpi: {
      revenue,
      revenueDelta: revenue - prevRevenue,
      count,
      countDelta: count - prevCount,
      avgOrderValue,
      avgOrderValueDelta: avgOrderValue - prevAvgOrderValue,
      profit,
      profitDelta: profit - prevProfit,
    },
    daily: daily.map((b, i) => ({ day: i + 1, ...b })),
    regionTotals: { jp: regionJP, us: regionUS },
    sourceTotals: { customer: sourceCustomer, store: sourceStore },
  };
}
