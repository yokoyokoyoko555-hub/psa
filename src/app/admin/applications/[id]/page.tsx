export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import UpchargeForm from "@/components/UpchargeForm";
import MarkReceivedButton from "@/components/MarkReceivedButton";
import CardListItem from "@/components/CardListItem";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { formatMoney, formatMoneyInt, formatMoneyIn } from "@/lib/currency";
import { CARD_DISPLAY_LABELS } from "@/lib/card-display";
import {
  REGION_LABELS,
  ITEM_TYPE_LABELS,
  resolveServiceLevel,
  computeDisplayStatus,
  DISPLAY_STATUS,
  getApplicationGroups,
} from "@/lib/application-status";

const UPCHARGE_STATUS_LABELS: Record<string, string> = {
  PENDING: "請求中",
  PAID: "支払済",
  FAILED: "失敗",
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
      cards: { orderBy: { lineNo: "asc" }, include: { upcharges: { orderBy: { createdAt: "desc" } } } },
      payments: { orderBy: { createdAt: "desc" } },
      agreement: true,
      submissionBooking: true,
      psaSubmissionGroup: true,
      // カード単位（サービスレベル別）のグループにまたがる場合の追加所属。ADR-0076
      groupMemberships: { include: { psaSubmissionGroup: true } },
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

  // 返却先住所（配送時のみ表示）。申込時に個別指定が無ければ顧客の登録住所を使用する。
  const shippingAddress = application.shippingAddressEncrypted
    ? (JSON.parse(decrypt(application.shippingAddressEncrypted)) as {
        name?: string;
        postalCode: string;
        prefecture: string;
        address: string;
        address2?: string;
      })
    : {
        name: customerName,
        postalCode: application.customer.postalCode,
        prefecture: decrypt(application.customer.prefectureEncrypted),
        address: decrypt(application.customer.addressEncrypted),
        address2: application.customer.address2Encrypted ? decrypt(application.customer.address2Encrypted) : undefined,
      };

  // 簡易ステータス（DISPLAY_STATUS）をバッジで常時表示する。ADR-0053/0063
  const isDraft = application.status === "DRAFT";
  const isCancelled = application.status === "CANCELLED";
  // 1申込が複数のPSA提出グループ（サービスレベル別）にまたがる場合は、グループごとに1行表示する。ADR-0076
  const allGroups = getApplicationGroups(application);
  const statusEntries =
    !isDraft && !isCancelled
      ? (allGroups.length > 0 ? allGroups : [null]).map((g) => ({
          label: g?.customServiceLevelName ?? null,
          status: computeDisplayStatus({ ...application, psaSubmissionGroup: g }),
        }))
      : [];
  const currentDisplayStatus = statusEntries.length === 1 ? statusEntries[0].status : null;
  // 現物が既に手元にある（自己入力=受取済み／代理入力=支払完了）のにPSA提出グループが未割当＝
  // 次にスタッフがやるべきアクション。ADR-0067
  const hasCardsInHand =
    application.source === "STORE"
      ? !application.payments.some((p) => p.status === "PENDING")
      : Boolean(application.receivedAt);
  const needsGroupAssignment = !isDraft && !isCancelled && hasCardsInHand && allGroups.length === 0;

  // カード単位でサービスレベルが異なる場合（代理入力の明細確定時など。ADR-0038）に、
  // 提出先・アイテム種別・サービスレベルがひと目でわかるようグループ化して表示する。
  const cardGroupMap = new Map<string, typeof application.cards>();
  for (const card of application.cards) {
    const key = card.customServiceLevelName ?? resolveServiceLevel(application);
    const bucket = cardGroupMap.get(key);
    if (bucket) bucket.push(card);
    else cardGroupMap.set(key, [card]);
  }
  const cardGroups = [...cardGroupMap.entries()].sort((a, b) => a[0].localeCompare(b[0], "ja"));

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
                {isDraft || isCancelled || currentDisplayStatus ? (
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      isCancelled
                        ? "bg-gray-100 text-gray-600"
                        : currentDisplayStatus === DISPLAY_STATUS.RETURNED || currentDisplayStatus === DISPLAY_STATUS.STORE_PICKUP_DONE
                        ? "bg-green-100 text-green-700"
                        : "bg-brand-100 text-brand-700"
                    }`}
                  >
                    {isDraft ? DISPLAY_STATUS.DRAFT : isCancelled ? "キャンセル" : currentDisplayStatus}
                  </span>
                ) : (
                  <div className="flex flex-col items-end gap-1">
                    {statusEntries.map((entry, i) => (
                      <span
                        key={i}
                        className={`px-3 py-1 rounded-full text-sm font-medium ${
                          entry.status === DISPLAY_STATUS.RETURNED || entry.status === DISPLAY_STATUS.STORE_PICKUP_DONE
                            ? "bg-green-100 text-green-700"
                            : "bg-brand-100 text-brand-700"
                        }`}
                      >
                        {entry.label ? `${entry.label}: ` : ""}
                        {entry.status}
                      </span>
                    ))}
                  </div>
                )}
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
                <p className="text-gray-500">提出先</p>
                <p className="font-medium text-gray-900">{REGION_LABELS[application.region] ?? application.region}</p>
              </div>
              {application.region === "PSA_US" && (
                <div>
                  <p className="text-gray-500">アイテム種別</p>
                  <p className="font-medium text-gray-900">{ITEM_TYPE_LABELS[application.itemType] ?? application.itemType}</p>
                </div>
              )}
              <div>
                <p className="text-gray-500">サービス</p>
                <p className="font-medium text-gray-900">{resolveServiceLevel(application)}</p>
              </div>
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
            <div className="space-y-6">
              {cardGroups.map(([serviceLevelName, cards]) => (
                <div key={serviceLevelName}>
                  {/* カードごとに異なるサービスレベルを選べるため（ADR-0038）、提出先・アイテム種別・サービスレベル単位でまとめて表示する */}
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
                    <span className="text-brand-400">（{cards.length}{CARD_DISPLAY_LABELS[application.itemType]?.quantityUnit ?? "枚"}）</span>
                  </div>
                  <div className="space-y-4">
                    {cards.map((card) => (
                      <CardListItem key={card.id} card={card} itemType={application.itemType} region={application.region} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Upcharge（申込単位で管理） */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-bold text-gray-900 mb-4">Upcharge</h2>
            {application.cards.some((c) => c.upcharges.length > 0) && (
              <div className="space-y-1 mb-4">
                {application.cards.flatMap((card) =>
                  card.upcharges.map((u) => (
                    <div key={u.id} className="flex items-center justify-between text-xs bg-gray-50 rounded px-3 py-2">
                      <span className="text-gray-700">
                        {card.cardName} ・ {formatMoneyIn(u.upchargeAmount, "JPY")}（{u.reason}）
                      </span>
                      <span className={`px-2 py-0.5 rounded-full font-medium ${
                        u.status === "PAID" ? "bg-green-100 text-green-700" :
                        u.status === "FAILED" ? "bg-red-100 text-red-700" :
                        "bg-yellow-100 text-yellow-700"
                      }`}>{UPCHARGE_STATUS_LABELS[u.status] ?? u.status}</span>
                    </div>
                  ))
                )}
              </div>
            )}
            <UpchargeForm
              cards={application.cards.map((c) => ({
                id: c.id,
                label: `${c.lineNo != null ? `${c.lineNo}. ` : ""}${c.cardName}（${c.tcgTitle}・申告額${formatMoneyInt(c.declaredValue, application.region)}）`,
              }))}
            />
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

          <div
            className={`bg-white rounded-xl border p-6 ${
              needsGroupAssignment ? "border-amber-300 ring-1 ring-amber-200" : "border-gray-200"
            }`}
          >
            <div className="flex items-center gap-2 mb-3">
              <h2 className="font-bold text-gray-900">PSA提出グループ</h2>
              {needsGroupAssignment && (
                <span className="text-xs font-bold text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">
                  次のアクション
                </span>
              )}
            </div>
            {needsGroupAssignment && (
              <p className="text-sm text-amber-700 mb-3">受取済みです。PSA提出グループへ割り当ててください。</p>
            )}
            {allGroups.length > 0 ? (
              <div className="space-y-4">
                {allGroups.map((group) => (
                  <dl key={group.id} className="space-y-2 text-sm border-b border-gray-100 last:border-b-0 pb-4 last:pb-0">
                    <div>
                      <dt className="text-gray-500 text-xs">グループ番号</dt>
                      <dd className="font-mono">{group.groupNo}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 text-xs">提出先</dt>
                      <dd className="font-medium text-gray-900">
                        {group.region ? (REGION_LABELS[group.region] ?? group.region) : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 text-xs">アイテム種別</dt>
                      <dd className="font-medium text-gray-900">
                        {group.itemType ? (ITEM_TYPE_LABELS[group.itemType] ?? group.itemType) : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 text-xs">サービスレベル</dt>
                      <dd className="font-medium text-gray-900">{group.customServiceLevelName ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 text-xs">申込番号（Sub#）</dt>
                      <dd className="font-mono font-bold">{group.psaSubmissionId ?? "—"}</dd>
                    </div>
                  </dl>
                ))}
              </div>
            ) : (
              !needsGroupAssignment && <p className="text-sm text-gray-500">未割当です。</p>
            )}
            <Link href="/admin/psa-groups" className="mt-4 block text-sm text-brand-600 hover:underline">
              PSA提出グループ管理 →
            </Link>
          </div>

          {/* 現物が既に手元にある状態になったら、提出予約の情報は不要。ADR-0067 */}
          {!hasCardsInHand && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-bold text-gray-900 mb-3">提出予約</h2>
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
          )}

          {application.returnMethod === "SHIPPING" && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-bold text-gray-900 mb-3">配送先住所</h2>
              <dl className="space-y-2 text-sm">
                {shippingAddress.name && (
                  <div>
                    <dt className="text-gray-500 text-xs">宛名</dt>
                    <dd className="font-medium text-gray-900">{shippingAddress.name}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-gray-500 text-xs">住所</dt>
                  <dd className="text-gray-900">
                    〒{shippingAddress.postalCode}
                    <br />
                    {shippingAddress.prefecture}{shippingAddress.address}
                    {shippingAddress.address2 ? ` ${shippingAddress.address2}` : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500 text-xs">電話番号</dt>
                  <dd className="font-medium text-gray-900">{shippingPhone}</dd>
                </div>
              </dl>
            </div>
          )}

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
