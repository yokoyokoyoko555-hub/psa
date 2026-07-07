export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import CopyButton from "@/components/CopyButton";
import CardStatusForm from "@/components/CardStatusForm";
import UpchargeForm from "@/components/UpchargeForm";
import MarkReceivedButton from "@/components/MarkReceivedButton";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { formatMoney, formatMoneyInt, formatMoneyIn } from "@/lib/currency";

const CARD_STATUS_LABELS: Record<string, string> = {
  DRAFT: "下書き",
  SUBMITTED_BY_CUSTOMER: "申込済",
  RECEIVED_BY_STORE: "店舗受取済",
  INSPECTION_PENDING: "検品待ち",
  INSPECTED: "検品済",
  READY_FOR_PSA: "PSA提出準備中",
  SUBMITTED_TO_PSA: "PSA提出済",
  PSA_RECEIVED: "PSA受付済",
  GRADING: "鑑定中",
  GRADE_AVAILABLE: "グレード確定",
  RETURNED_TO_STORE: "店舗返却済",
  READY_FOR_CUSTOMER_RETURN: "返却準備中",
  RETURNED_TO_CUSTOMER: "返却完了",
  UPCHARGE_UNPAID: "Upcharge未払い",
  UPCHARGE_PAID: "Upcharge支払済",
  PROBLEM: "問題発生",
  CANCELLED: "キャンセル",
};

// PSA提出フォームは英語1行のため、言語は英語表記でコピーする。
// 自由記述化（ADR-0023）後は代表的な入力のみ変換し、それ以外はそのまま出力する。
// 旧CardLanguage enum値（既存データ）もあわせてマッピング。
const LANGUAGE_PSA: Record<string, string> = {
  日本語: "Japanese",
  英語: "English",
  韓国語: "Korean",
  中国語: "Chinese",
  その他: "Other",
  JAPANESE: "Japanese",
  ENGLISH: "English",
  KOREAN: "Korean",
  CHINESE: "Chinese",
  OTHER: "Other",
};

const ITEM_TYPE_LABELS: Record<string, string> = {
  TRADING_CARD: "トレーディングカード",
  UNOPENED_PACK: "未開封パック",
  COMIC_MAGAZINE: "コミック・マガジン",
};

// アイテム種別ごとの表示ラベル切替（入力フォームと同じ考え方の表示専用版）。ADR-0033
const CARD_DISPLAY_LABELS: Record<string, { entryLabel: string; secondaryLabel: string; quantityUnit: string }> = {
  TRADING_CARD: { entryLabel: "カード", secondaryLabel: "言語", quantityUnit: "枚" },
  UNOPENED_PACK: { entryLabel: "パック", secondaryLabel: "言語", quantityUnit: "枚" },
  COMIC_MAGAZINE: { entryLabel: "コミック／マガジン", secondaryLabel: "出版社", quantityUnit: "冊" },
};

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  SUBMITTED_BY_CUSTOMER: "bg-brand-100 text-brand-700",
  RECEIVED_BY_STORE: "bg-brand-100 text-brand-700",
  INSPECTION_PENDING: "bg-yellow-100 text-yellow-700",
  INSPECTED: "bg-yellow-100 text-yellow-700",
  READY_FOR_PSA: "bg-purple-100 text-purple-700",
  SUBMITTED_TO_PSA: "bg-purple-100 text-purple-700",
  PSA_RECEIVED: "bg-purple-100 text-purple-700",
  GRADING: "bg-brand-100 text-brand-700",
  GRADE_AVAILABLE: "bg-green-100 text-green-700",
  RETURNED_TO_STORE: "bg-green-100 text-green-700",
  READY_FOR_CUSTOMER_RETURN: "bg-green-100 text-green-700",
  RETURNED_TO_CUSTOMER: "bg-gray-100 text-gray-600",
  UPCHARGE_UNPAID: "bg-red-100 text-red-700",
  UPCHARGE_PAID: "bg-green-100 text-green-700",
  PROBLEM: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-600",
};

export default async function AdminApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const application = await prisma.application.findUnique({
    where: { id },
    include: {
      customer: true,
      cards: { orderBy: { createdAt: "asc" }, include: { upcharges: { orderBy: { createdAt: "desc" } } } },
      payments: { orderBy: { createdAt: "desc" } },
      agreement: true,
      submissionBooking: true,
      psaSubmissionGroup: true,
    },
  });

  if (!application) notFound();

  const customerName = application.customer.nameEncrypted
    ? decrypt(application.customer.nameEncrypted)
    : "-";
  const customerPhone = application.customer.phoneEncrypted
    ? decrypt(application.customer.phoneEncrypted)
    : "-";
  const shippingPhone = application.shippingPhoneEncrypted
    ? decrypt(application.shippingPhoneEncrypted)
    : customerPhone;
  const customerEmail = application.customer.email;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/applications" className="text-sm text-brand-600 hover:underline">
          ← 申込一覧
        </Link>
        <span className="text-gray-400">/</span>
        <span className="font-mono text-sm text-gray-600">{application.applicationNo}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Application info */}
        <div className="lg:col-span-2 space-y-4">
          {/* Summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  申込 {application.applicationNo}
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                  {format(new Date(application.createdAt), "yyyy年M月d日 HH:mm", { locale: ja })}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    application.status === "COMPLETED"
                      ? "bg-green-100 text-green-700"
                      : application.status === "CANCELLED"
                      ? "bg-gray-100 text-gray-600"
                      : "bg-brand-100 text-brand-700"
                  }`}
                >
                  {application.status}
                </span>
                {application.status !== "DRAFT" && application.status !== "CANCELLED" && (
                  application.receivedAt ? (
                    <span className="text-xs text-gray-500">
                      受取完了: {format(new Date(application.receivedAt), "yyyy/MM/dd HH:mm")}
                    </span>
                  ) : (
                    <MarkReceivedButton applicationId={application.id} />
                  )
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-gray-500">サービス</p>
                <p className="font-medium text-gray-900">{application.serviceLevel}</p>
              </div>
              {application.region === "PSA_US" && (
                <div>
                  <p className="text-gray-500">アイテム種別</p>
                  <p className="font-medium text-gray-900">{ITEM_TYPE_LABELS[application.itemType] ?? application.itemType}</p>
                </div>
              )}
              <div>
                <p className="text-gray-500">返却方法</p>
                <p className="font-medium text-gray-900">
                  {application.returnMethod === "STORE_PICKUP" ? "店頭受取" : "配送"}
                </p>
              </div>
              <div>
                <p className="text-gray-500">カード枚数</p>
                <p className="font-medium text-gray-900">{application.cards.length}枚</p>
              </div>
              <div>
                <p className="text-gray-500">合計金額</p>
                <p className="font-bold text-gray-900">
                  {formatMoneyIn(application.totalAmount, "JPY")}
                </p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-gray-500">PSA料金</p>
                <p className="font-medium">{formatMoney(application.psaFeeTotal, application.region)}</p>
              </div>
              {application.autographFeeTotal > 0 && (
                <div>
                  <p className="text-gray-500">オートグラフ料金</p>
                  <p className="font-medium">{formatMoney(application.autographFeeTotal, application.region)}</p>
                </div>
              )}
              <div>
                <p className="text-gray-500">代理入力料金</p>
                <p className="font-medium">{formatMoneyIn(application.agencyFeeTotal, "JPY")}</p>
              </div>
              <div>
                <p className="text-gray-500">送料・保険料</p>
                <p className="font-medium">{formatMoneyIn(application.shippingFee + application.insuranceFee, "JPY")}</p>
              </div>
              <div>
                <p className="text-gray-500">事務手数料</p>
                <p className="font-medium">{formatMoneyIn(application.handlingFee, "JPY")}</p>
              </div>
              {application.discountAmount > 0 && (
                <div>
                  <p className="text-gray-500">キャンペーン割引</p>
                  <p className="font-medium text-brand-700">-{formatMoneyIn(application.discountAmount, "JPY")}{application.campaignName ? `（${application.campaignName}）` : ""}</p>
                </div>
              )}
              {application.region === "PSA_US" && application.exchangeRateUsed && (
                <div>
                  <p className="text-gray-500">為替レート（申込時点）</p>
                  <p className="font-medium">$1 = {formatMoneyIn(application.exchangeRateUsed, "JPY")}</p>
                </div>
              )}
            </div>
          </div>

          {/* Cards */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-bold text-gray-900 mb-4">
              {CARD_DISPLAY_LABELS[application.itemType]?.entryLabel ?? "カード"}一覧（{application.cards.length}{CARD_DISPLAY_LABELS[application.itemType]?.quantityUnit ?? "枚"}）
            </h2>
            <div className="space-y-4">
              {application.cards.map((card) => {
                const displayLabels = CARD_DISPLAY_LABELS[application.itemType] ?? CARD_DISPLAY_LABELS.TRADING_CARD;
                // PSA提出フォーム向け1行（発行年 タイトル 言語(英語)/出版社 カード番号／型番 カード名 レアリティ・半角スペース区切り）
                // トレカ以外はcardNumber/rarityが空文字のためfilterで自然に除外される。ADR-0033
                const psaLine = [
                  card.releaseYear ?? "",
                  card.tcgTitle,
                  application.itemType === "TRADING_CARD" ? LANGUAGE_PSA[card.language] ?? card.language : card.language,
                  card.cardNumber ?? "",
                  card.cardName,
                  card.rarity ?? "",
                ]
                  .filter((v) => v !== "" && v != null)
                  .join(" ");
                return (
                <div
                  key={card.id}
                  className="border border-gray-200 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{card.cardName}</span>
                        {card.autographRequested && (
                          <span className="text-xs bg-brand-100 text-brand-700 rounded-full px-2 py-0.5">
                            🖊 オートグラフ
                          </span>
                        )}
                        {/* PSA提出フォーム向け: 半角スペース区切り1行をコピー */}
                        <CopyButton label="行コピー" text={psaLine} />
                      </div>
                      {/* 顧客入力内容を半角スペース区切り1行で表示（コピー内容と同一） */}
                      <p className="mt-1 text-xs font-mono text-gray-700 bg-gray-50 rounded px-2 py-1 break-all">
                        {psaLine}
                      </p>
                      <p className="mt-1 flex gap-3 text-xs text-gray-500">
                        <span className="font-mono text-gray-400">{card.cardNo}</span>
                        <span>申告額: {formatMoneyInt(card.declaredValue, application.region)}</span>
                        <span>{displayLabels.secondaryLabel}: {card.language}</span>
                        <span>{card.quantity}{displayLabels.quantityUnit}</span>
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-xs px-2 py-1 rounded-full font-medium ${
                        STATUS_BADGE[card.status] ?? "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {CARD_STATUS_LABELS[card.status] ?? card.status}
                    </span>
                  </div>

                  {/* Upcharge履歴 */}
                  {card.upcharges.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {card.upcharges.map((u) => (
                        <div key={u.id} className="flex items-center justify-between text-xs bg-gray-50 rounded px-2 py-1">
                          <span className="text-gray-600">Upcharge {formatMoneyIn(u.upchargeAmount, "JPY")}（{u.reason}）</span>
                          <span className={`px-2 py-0.5 rounded-full font-medium ${
                            u.status === "PAID" ? "bg-green-100 text-green-700" :
                            u.status === "FAILED" ? "bg-red-100 text-red-700" :
                            "bg-yellow-100 text-yellow-700"
                          }`}>{u.status}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 操作: ステータス更新 / Upcharge / QR */}
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-gray-100">
                    <div>
                      <p className="text-xs font-bold text-gray-500 mb-1">ステータス更新</p>
                      <CardStatusForm cardId={card.id} currentStatus={card.status} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-500 mb-1">Upcharge登録・請求</p>
                      <UpchargeForm cardId={card.id} />
                      <a
                        href={`/api/qrcode?cardId=${card.id}`}
                        target="_blank"
                        className="mt-2 inline-block text-xs text-brand-600 hover:underline"
                      >
                        📱 QRコードを印刷
                      </a>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          </div>

          {/* Payments */}
          {application.payments.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-bold text-gray-900 mb-4">決済履歴</h2>
              <div className="space-y-2">
                {application.payments.map((p) => (
                  <div key={p.id} className="flex justify-between text-sm py-2 border-b border-gray-50">
                    <div>
                      <span className={`text-xs px-2 py-0.5 rounded-full mr-2 ${
                        p.status === "SUCCEEDED" ? "bg-green-100 text-green-700" :
                        p.status === "FAILED" ? "bg-red-100 text-red-700" :
                        "bg-yellow-100 text-yellow-700"
                      }`}>
                        {p.status}
                      </span>
                      <span className="text-gray-500 font-mono text-xs">{p.stripePaymentIntentId}</span>
                    </div>
                    <span className="font-medium text-gray-900">
                      {formatMoneyIn(p.amount, p.currency === "usd" ? "USD" : "JPY")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Customer info */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-bold text-gray-900 mb-4">顧客情報</h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-gray-500 text-xs">氏名</dt>
                <dd className="font-medium text-gray-900">{customerName}</dd>
              </div>
              <div>
                <dt className="text-gray-500 text-xs">メール</dt>
                <dd className="text-gray-900 break-all">{customerEmail}</dd>
              </div>
              <div>
                <dt className="text-gray-500 text-xs">電話番号</dt>
                <dd className="font-medium text-gray-900">{shippingPhone}</dd>
              </div>
            </dl>
            <Link
              href={`/admin/customers/${application.customerId}`}
              className="mt-4 block text-sm text-brand-600 hover:underline"
            >
              顧客詳細を見る →
            </Link>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-bold text-gray-900 mb-3">PSA提出グループ</h2>
            {application.psaSubmissionGroup ? (
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-gray-500 text-xs">グループ番号</dt>
                  <dd className="font-mono">{application.psaSubmissionGroup.groupNo}</dd>
                </div>
                <div>
                  <dt className="text-gray-500 text-xs">PSA Submission ID</dt>
                  <dd className="font-mono font-bold">{application.psaSubmissionGroup.psaSubmissionId ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-gray-500 text-xs">PSA Order ID（申請番号）</dt>
                  <dd className="font-mono">{application.psaSubmissionGroup.psaOrderId ?? "—"}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-gray-500">未割当です。</p>
            )}
            <Link href="/admin/psa-groups" className="mt-4 block text-sm text-brand-600 hover:underline">
              PSA提出グループ管理 →
            </Link>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-bold text-gray-900 mb-3">カード提出予約</h2>
            {application.submissionBooking?.status === "BOOKED" ? (
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-gray-500 text-xs">予約日時</dt>
                  <dd className="font-bold text-gray-900">
                    {format(new Date(application.submissionBooking.scheduledAt), "yyyy/M/d HH:mm", { locale: ja })}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500 text-xs">方法</dt>
                  <dd className="font-medium text-gray-900">
                    {application.submissionBooking.method === "STORE_DROP_OFF" ? "店頭持込" : "郵送予定"}
                  </dd>
                </div>
                {application.submissionBooking.note && (
                  <div>
                    <dt className="text-gray-500 text-xs">備考</dt>
                    <dd className="text-gray-900 whitespace-pre-wrap">{application.submissionBooking.note}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="text-sm text-gray-500">予約はまだありません。</p>
            )}
            <Link
              href="/admin/submission-bookings"
              className="mt-4 block text-sm text-brand-600 hover:underline"
            >
              予約カレンダーを見る →
            </Link>
          </div>

          {application.agreement && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-bold text-gray-900 mb-3">利用規約同意</h2>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-gray-500 text-xs">バージョン</dt>
                  <dd className="font-mono">{application.agreement.version}</dd>
                </div>
                <div>
                  <dt className="text-gray-500 text-xs">同意日時</dt>
                  <dd>
                    {format(
                      new Date(application.agreement.agreedAt),
                      "yyyy/M/d HH:mm",
                      { locale: ja }
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500 text-xs">IPアドレス</dt>
                  <dd className="font-mono text-xs">{application.agreement.ipAddress ?? "-"}</dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
