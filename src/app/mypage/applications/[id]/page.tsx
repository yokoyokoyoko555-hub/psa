export const dynamic = "force-dynamic";

import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCustomerSession } from "@/lib/customer-auth";
import { getApplicationDetail } from "@/actions/application";
import CustomerHeader from "@/components/CustomerHeader";
import DifferentialPaymentPanel from "@/components/DifferentialPaymentPanel";
import { formatMoney, formatMoneyIn } from "@/lib/currency";
import { format } from "date-fns";
import { ja } from "date-fns/locale";

const CARD_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "下書き", color: "bg-gray-100 text-gray-600" },
  SUBMITTED_BY_CUSTOMER: { label: "申込済", color: "bg-brand-100 text-brand-700" },
  RECEIVED_BY_STORE: { label: "店舗受取済", color: "bg-brand-100 text-brand-700" },
  INSPECTION_PENDING: { label: "検品待ち", color: "bg-yellow-100 text-yellow-700" },
  INSPECTED: { label: "検品済", color: "bg-yellow-100 text-yellow-700" },
  READY_FOR_PSA: { label: "PSA提出準備中", color: "bg-orange-100 text-orange-700" },
  SUBMITTED_TO_PSA: { label: "PSA提出済", color: "bg-purple-100 text-purple-700" },
  PSA_RECEIVED: { label: "PSA受付済", color: "bg-purple-100 text-purple-700" },
  GRADING: { label: "鑑定中", color: "bg-purple-100 text-purple-700" },
  GRADE_AVAILABLE: { label: "グレード確定", color: "bg-green-100 text-green-700" },
  RETURNED_TO_STORE: { label: "店舗返却済", color: "bg-green-100 text-green-700" },
  READY_FOR_CUSTOMER_RETURN: { label: "返却準備中", color: "bg-teal-100 text-teal-700" },
  RETURNED_TO_CUSTOMER: { label: "返却完了", color: "bg-green-100 text-green-700" },
  UPCHARGE_UNPAID: { label: "Upcharge未払い", color: "bg-red-100 text-red-700" },
  UPCHARGE_PAID: { label: "Upcharge支払済", color: "bg-green-100 text-green-700" },
  PROBLEM: { label: "問題発生", color: "bg-red-100 text-red-700" },
  CANCELLED: { label: "キャンセル", color: "bg-gray-100 text-gray-600" },
};

const SERVICE_LABELS: Record<string, string> = {
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

const ITEM_TYPE_LABELS: Record<string, string> = {
  TRADING_CARD: "トレーディングカード",
  UNOPENED_PACK: "未開封パック",
  COMIC_MAGAZINE: "コミック・マガジン",
};

// アイテム種別ごとの表示ラベル切替。ADR-0033
const CARD_DISPLAY_LABELS: Record<string, { entryLabel: string; quantityUnit: string }> = {
  TRADING_CARD: { entryLabel: "カード", quantityUnit: "枚" },
  UNOPENED_PACK: { entryLabel: "パック", quantityUnit: "枚" },
  COMIC_MAGAZINE: { entryLabel: "コミック／マガジン", quantityUnit: "冊" },
};

export default async function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await getCustomerSession();
  if (!customer) redirect("/login");

  const application = await getApplicationDetail(id);
  if (!application) notFound();
  const isPaid = application.payments.some((p) => p.status === "SUCCEEDED");
  const pendingPayment = application.payments.find((p) => p.status === "PENDING");
  // 代理申込の先払い（概算の代理入力料金）記録。何をいつ払ったか顧客に分かるよう表示する。ADR-0049
  const prepayPayment =
    application.source === "STORE"
      ? [...application.payments]
          .filter((p) => p.status === "SUCCEEDED")
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0]
      : undefined;

  return (
    <div className="min-h-screen bg-gray-50">
      <CustomerHeader
        title={application.applicationNo}
        actions={
          <Link href="/mypage/applications" className="text-sm text-gray-500 hover:text-gray-700">
            申込一覧
          </Link>
        }
      />

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-bold text-gray-900 mb-4">申込概要</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500">サービス</p>
              <p className="font-medium">{SERVICE_LABELS[application.serviceLevel]}</p>
            </div>
            {application.region === "PSA_US" && (
              <div>
                <p className="text-gray-500">アイテム種別</p>
                <p className="font-medium">{ITEM_TYPE_LABELS[application.itemType] ?? application.itemType}</p>
              </div>
            )}
            <div>
              <p className="text-gray-500">返却方法</p>
              <p className="font-medium">{application.returnMethod === "STORE_PICKUP" ? "店頭受取" : "配送"}</p>
            </div>
            <div>
              <p className="text-gray-500">申込日</p>
              <p className="font-medium">{format(new Date(application.createdAt), "yyyy/MM/dd", { locale: ja })}</p>
            </div>
            <div>
              <p className="text-gray-500">合計金額</p>
              <p className="font-bold text-lg">{formatMoneyIn(application.totalAmount, "JPY")}</p>
            </div>
          </div>

          {/* Fee breakdown */}
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-1 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>PSA鑑定料</span><span>{formatMoney(application.psaFeeTotal, application.region)}</span>
            </div>
            {application.agencyFeeTotal > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>代理入力料金</span><span>{formatMoneyIn(application.agencyFeeTotal, "JPY")}</span>
              </div>
            )}
            <div className="flex justify-between text-gray-600">
              <span>送料・保険料</span><span>{formatMoneyIn(application.shippingFee + application.insuranceFee, "JPY")}</span>
            </div>
            {application.handlingFee > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>事務手数料</span><span>{formatMoneyIn(application.handlingFee, "JPY")}</span>
              </div>
            )}
            {application.discountAmount > 0 && (
              <div className="flex justify-between text-brand-700">
                <span>キャンペーン割引{application.campaignName ? `（${application.campaignName}）` : ""}</span>
                <span>-{formatMoneyIn(application.discountAmount, "JPY")}</span>
              </div>
            )}
            {application.region === "PSA_US" && application.exchangeRateUsed && (
              <p className="text-xs text-gray-400">
                為替レート: $1 = {formatMoneyIn(application.exchangeRateUsed, "JPY")}（申込時点）
              </p>
            )}
            <div className="flex justify-between font-bold border-t border-gray-200 pt-1 mt-1">
              <span>合計</span><span>{formatMoneyIn(application.totalAmount, "JPY")}</span>
            </div>
            <p className="text-xs text-gray-400 text-right">
              （内消費税 {formatMoneyIn(application.taxAmount, "JPY")}）
            </p>
          </div>
        </div>

        {prepayPayment && application.agencyQuantity != null && application.agencyQuantity > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-bold text-gray-900 mb-3">お支払い済みの料金</h2>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-sm">
              <span className="text-gray-600">
                {format(new Date(prepayPayment.paidAt ?? prepayPayment.createdAt), "yyyy年M月d日 HH:mm", { locale: ja })}
                　代理入力料金　{application.agencyQuantity}件×
                {formatMoneyIn(Math.round(application.prepaidAmount / application.agencyQuantity), "JPY")}
              </span>
              <span className="font-bold text-gray-900">{formatMoneyIn(application.prepaidAmount, "JPY")}</span>
            </div>
          </div>
        )}

        {pendingPayment && (
          <DifferentialPaymentPanel
            applicationId={application.id}
            amount={pendingPayment.amount}
            publishableKey={process.env.STRIPE_PUBLISHABLE_KEY!}
          />
        )}

        {/* Submission booking */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="font-bold text-gray-900">提出予約</h2>
              {application.submissionBooking?.status === "BOOKED" ? (
                <p className="text-sm text-gray-600 mt-1">
                  {format(new Date(application.submissionBooking.scheduledAt), "yyyy/MM/dd HH:mm", { locale: ja })}
                  {" / "}
                  {application.submissionBooking.method === "STORE_DROP_OFF" ? "店頭持込" : "郵送予定"}
                </p>
              ) : (
                <p className="text-sm text-gray-500 mt-1">
                  お支払い後、カードの店頭持込または郵送予定を予約できます。
                </p>
              )}
            </div>
            {isPaid ? (
              <Link
                href={`/mypage/submission-booking/${application.id}`}
                className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700"
              >
                予約する
              </Link>
            ) : (
              <span className="text-sm font-bold text-gray-400">決済完了後に予約できます</span>
            )}
          </div>
        </div>

        {/* Cards */}
        <div>
          <h2 className="font-bold text-gray-900 mb-4">
            {(CARD_DISPLAY_LABELS[application.itemType] ?? CARD_DISPLAY_LABELS.TRADING_CARD).entryLabel}一覧（
            {application.cards.length}
            {(CARD_DISPLAY_LABELS[application.itemType] ?? CARD_DISPLAY_LABELS.TRADING_CARD).quantityUnit}）
          </h2>
          <div className="space-y-3">
            {application.cards.map((card) => {
              const statusInfo = CARD_STATUS_LABELS[card.status] ?? { label: card.status, color: "bg-gray-100 text-gray-600" };
              return (
                <div key={card.id} className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-mono text-xs text-gray-400">{card.cardNo}</p>
                      <p className="font-bold text-gray-900">{card.cardName}</p>
                      <p className="text-sm text-gray-500">{card.tcgTitle}</p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                  </div>

                  {card.psaGrade && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-3">
                      <p className="text-sm font-bold text-yellow-800">
                        PSA Grade: {card.psaGrade}
                        {card.psaCertNo && <span className="ml-3 font-normal text-yellow-600">Cert# {card.psaCertNo}</span>}
                      </p>
                    </div>
                  )}

                  {/* Status history */}
                  <div className="mt-3">
                    <details className="text-xs text-gray-500">
                      <summary className="cursor-pointer hover:text-gray-700">ステータス履歴</summary>
                      <div className="mt-2 space-y-1 pl-2 border-l-2 border-gray-100">
                        {card.statusHistory.map((h) => (
                          <div key={h.id} className="flex justify-between">
                            <span>{CARD_STATUS_LABELS[h.status]?.label ?? h.status}</span>
                            <span>{format(new Date(h.changedAt), "MM/dd HH:mm")}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
