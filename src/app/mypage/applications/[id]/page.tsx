export const dynamic = "force-dynamic";

import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCustomerSession } from "@/lib/customer-auth";
import { getApplicationDetail } from "@/actions/application";
import CustomerHeader from "@/components/CustomerHeader";
import Footer from "@/components/Footer";
import DifferentialPaymentPanel from "@/components/DifferentialPaymentPanel";
import { formatMoney, formatMoneyIn, formatMoneyInt } from "@/lib/currency";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { computeDisplayStatus, DISPLAY_STATUS, getApplicationGroups, REGION_LABELS, resolveServiceLevel } from "@/lib/application-status";

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
  const displayLabels = CARD_DISPLAY_LABELS[application.itemType] ?? CARD_DISPLAY_LABELS.TRADING_CARD;
  const isStoreInput = application.source === "STORE";
  const isDraft = application.status === "DRAFT";
  const isCancelled = application.status === "CANCELLED";
  // 1申込が複数のPSA提出グループ（サービスレベル別）にまたがる場合は、グループごとに1行表示する。ADR-0076
  const groups = getApplicationGroups(application);
  const statusEntries =
    !isDraft && !isCancelled
      ? (groups.length > 0 ? groups : [null]).map((g) => ({
          label: g?.customServiceLevelName ?? null,
          status: computeDisplayStatus({ ...application, psaSubmissionGroup: g }),
        }))
      : [];
  const displayStatus = statusEntries.length === 1 ? statusEntries[0].status : null;

  // 鑑定料をサービスレベルごとの内訳に分解する（代理入力は複数サービスレベルが混在しうるため）。ADR-0050
  const psaFeeGroups = Object.values(
    application.cards.reduce<Record<string, { name: string; quantity: number; feeTotal: number }>>((acc, c) => {
      const key = c.customServiceLevelName ?? SERVICE_LABELS[application.serviceLevel] ?? application.serviceLevel;
      if (!acc[key]) acc[key] = { name: key, quantity: 0, feeTotal: 0 };
      acc[key].quantity += c.quantity;
      acc[key].feeTotal += c.psaFee;
      return acc;
    }, {})
  );

  // カードごとに異なるサービスレベルを選べるため（ADR-0038）、提出先・アイテム種別・サービスレベル単位でまとめて表示する
  const cardGroupMap = new Map<string, typeof application.cards>();
  for (const card of application.cards) {
    const key = card.customServiceLevelName ?? resolveServiceLevel(application);
    const bucket = cardGroupMap.get(key);
    if (bucket) bucket.push(card);
    else cardGroupMap.set(key, [card]);
  }
  const cardGroups = [...cardGroupMap.entries()].sort((a, b) => a[0].localeCompare(b[0], "ja"));

  // 代理入力は明細を当社スタッフが入力するため、顧客が確認できるようカード一覧をサービスレベル・
  // 申告額つきで表示する（自己入力は自分で入力した内容のため付加情報は出さない）。ADR-0050
  const cardsSection = (
    <div>
      <h2 className="font-bold text-gray-900 mb-1">
        {displayLabels.entryLabel}一覧（{application.cards.length}
        {displayLabels.quantityUnit}）
      </h2>
      {isStoreInput && (
        <p className="text-sm text-gray-500 mb-4">代理入力していただいた内容をご確認ください。</p>
      )}
      <div className="space-y-6 mt-4">
        {cardGroups.map(([serviceLevelName, cards]) => (
          <div key={serviceLevelName}>
            <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mb-2 px-3 py-2 bg-brand-50 border border-brand-100 rounded-lg text-xs text-brand-800">
              <span className="font-bold">{REGION_LABELS[application.region] ?? application.region}</span>
              {application.region === "PSA_US" && (
                <>
                  <span className="text-brand-300">・</span>
                  <span>{ITEM_TYPE_LABELS[application.itemType] ?? application.itemType}</span>
                </>
              )}
              <span className="text-brand-300">・</span>
              <span className="font-bold">{serviceLevelName}</span>
              <span className="text-brand-400">（{cards.length}{displayLabels.quantityUnit}）</span>
            </div>
            <div className="space-y-3">
              {cards.map((card) => (
                <div key={card.id} className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center gap-2">
                    {card.lineNo != null && (
                      <span className="shrink-0 w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-xs font-bold flex items-center justify-center">
                        {card.lineNo}
                      </span>
                    )}
                    <p className="font-mono text-xs text-gray-400">{card.cardNo}</p>
                  </div>
                  <p className="font-bold text-gray-900">{card.cardName}</p>
                  <p className="text-sm text-gray-500">{card.tcgTitle}</p>
                  {isStoreInput && (
                    <p className="text-xs text-gray-500 mt-1">
                      サービス: {card.customServiceLevelName ?? "—"}　/　{card.quantity}
                      {displayLabels.quantityUnit}　/　申告額 {formatMoneyInt(card.declaredValue, application.region)}
                    </p>
                  )}

                  {card.psaGrade && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-3">
                      <p className="text-sm font-bold text-yellow-800">
                        PSA Grade: {card.psaGrade}
                        {card.psaCertNo && <span className="ml-3 font-normal text-yellow-600">Cert# {card.psaCertNo}</span>}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <CustomerHeader
        title={application.applicationNo}
        actions={
          <Link href="/mypage/applications" className="text-sm text-gray-500 hover:text-gray-700">
            申込一覧
          </Link>
        }
      />

      <main className="flex-1 max-w-4xl mx-auto px-4 py-8 space-y-6">
        {isStoreInput && cardsSection}

        {/* Summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900">{isStoreInput ? "請求内容の確認" : "申込概要"}</h2>
            <div className="flex flex-col items-end gap-1">
              {isDraft || isCancelled || displayStatus ? (
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    isCancelled
                      ? "bg-gray-100 text-gray-600"
                      : displayStatus === DISPLAY_STATUS.RETURNED || displayStatus === DISPLAY_STATUS.STORE_PICKUP_DONE
                      ? "bg-green-100 text-green-700"
                      : "bg-brand-100 text-brand-700"
                  }`}
                >
                  {isDraft ? DISPLAY_STATUS.DRAFT : isCancelled ? "キャンセル" : displayStatus}
                </span>
              ) : (
                statusEntries.map((entry, i) => (
                  <span
                    key={i}
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      entry.status === DISPLAY_STATUS.RETURNED || entry.status === DISPLAY_STATUS.STORE_PICKUP_DONE
                        ? "bg-green-100 text-green-700"
                        : "bg-brand-100 text-brand-700"
                    }`}
                  >
                    {entry.label ? `${entry.label}: ` : ""}
                    {entry.status}
                  </span>
                ))
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            {!isStoreInput && (
              <div>
                <p className="text-gray-500">サービス</p>
                <p className="font-medium">{SERVICE_LABELS[application.serviceLevel]}</p>
              </div>
            )}
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
            {psaFeeGroups.map((g) => (
              <div key={g.name} className="flex justify-between text-gray-600">
                <span>
                  鑑定料（{g.name}）
                  <span className="text-xs text-gray-400">
                    {" "}
                    {formatMoney(g.quantity > 0 ? g.feeTotal / g.quantity : 0, application.region)}×{g.quantity}
                    {displayLabels.quantityUnit}
                  </span>
                </span>
                <span>{formatMoney(g.feeTotal, application.region)}</span>
              </div>
            ))}
            {application.agencyFeeTotal > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>
                  代理入力料金
                  {application.cards.length > 0 && (
                    <span className="text-xs text-gray-400">
                      {" "}
                      {formatMoneyIn(Math.round(application.agencyFeeTotal / application.cards.length), "JPY")}×
                      {application.cards.length}件
                    </span>
                  )}
                </span>
                <span>{formatMoneyIn(application.agencyFeeTotal, "JPY")}</span>
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

            {prepayPayment && application.agencyQuantity != null && application.agencyQuantity > 0 && (
              <>
                <div className="flex justify-between text-gray-500 text-xs">
                  <span>先払い済み額</span><span>{formatMoneyIn(application.prepaidAmount, "JPY")}</span>
                </div>
                <div className="flex justify-between font-bold text-brand-700 border-t border-gray-200 pt-1 mt-1">
                  <span>顧客への請求額（差額）</span>
                  <span>
                    {formatMoneyIn(
                      pendingPayment?.amount ?? Math.max(application.totalAmount - application.prepaidAmount, 0),
                      "JPY"
                    )}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

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

        {!isStoreInput && cardsSection}
      </main>
      <Footer />
    </div>
  );
}
