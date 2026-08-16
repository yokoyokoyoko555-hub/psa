export const dynamic = "force-dynamic";

import { getAllPurchaseAgreements } from "@/actions/purchase";
import { decrypt } from "@/lib/crypto";
import ReviewAgreementForm from "./ReviewAgreementForm";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "下書き",
  UNDER_REVIEW: "審査待ち",
  AWAITING_CUSTOMER_AGREEMENT: "顧客同意待ち",
  ACTIVE: "出品中",
  PRICE_REVISION_PENDING: "価格変更申請中",
  PURCHASE_TRIGGERED: "落札成立（買取手続き中）",
  PURCHASE_COMPLETED: "買取成立",
  UNSOLD_AWAITING_CUSTOMER_CHOICE: "売れ残り（顧客選択待ち）",
  RELISTED: "再出品済み",
  RETURN_REQUESTED: "返却手続き中",
  EXPIRED: "期限切れ",
  CANCELLED: "キャンセル",
  SUSPENDED: "一時停止中",
};

const STATUS_BADGE: Record<string, string> = {
  UNDER_REVIEW: "bg-amber-100 text-amber-700",
  AWAITING_CUSTOMER_AGREEMENT: "bg-blue-100 text-blue-700",
  ACTIVE: "bg-green-100 text-green-700",
  PURCHASE_TRIGGERED: "bg-green-100 text-green-700",
  PURCHASE_COMPLETED: "bg-green-100 text-green-700",
};

/** 買取契約の管理画面（申請一覧・審査）。ADR-0087 */
export default async function AdminPurchaseAgreementsPage() {
  const agreements = await getAllPurchaseAgreements();

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-gray-900">買取契約</h1>

      <div className="space-y-3">
        {agreements.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
            買取の申請はまだありません。
          </div>
        )}
        {agreements.map((a) => (
          <div key={a.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-xs text-gray-400">{a.agreementNo}</p>
                <p className="font-bold text-gray-900">{a.card.cardName}（{a.card.cardNo}）</p>
                <p className="text-sm text-gray-500">{decrypt(a.customer.nameEncrypted)}</p>
                <p className="text-xs text-gray-500 mt-1">
                  顧客希望開始価格: ${(a.customerDesiredPriceUsdMinor / 100).toFixed(2)}
                  {a.startingPriceUsdMinor != null && ` / 確定開始価格: $${(a.startingPriceUsdMinor / 100).toFixed(2)}`}
                  {a.reservePriceUsdMinor != null && ` / 予約価格: $${(a.reservePriceUsdMinor / 100).toFixed(2)}`}
                </p>
                <p className="text-xs text-gray-500">
                  出品期間: {a.listingDurationOption ? `${a.listingDurationOption.label}（${a.listingDurationOption.days}日間）` : "—"}
                </p>
              </div>
              <span className={`shrink-0 px-2 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[a.status] ?? "bg-gray-100 text-gray-600"}`}>
                {STATUS_LABELS[a.status] ?? a.status}
              </span>
            </div>
            {a.status === "UNDER_REVIEW" && (
              <ReviewAgreementForm agreementId={a.id} customerDesiredPriceUsdMinor={a.customerDesiredPriceUsdMinor} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
