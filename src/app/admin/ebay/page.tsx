export const dynamic = "force-dynamic";

import Link from "next/link";

/**
 * 販売（eBay委託販売）タブの着地点。Phase 2以降、委託契約・出品・注文/精算・発送などの
 * 画面をここに追加していく（docs/EBAY_CONSIGNMENT_SALES_SPEC.md §14.2 / ADR-0079）。
 */
export default function AdminEbayDashboardPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-gray-900">販売（eBay委託販売）</h1>
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
        <p className="text-sm text-gray-600">
          出品・注文精算・発送の管理画面はPhase 3以降に順次実装します。実装状況は{" "}
          <span className="font-mono text-xs bg-gray-50 rounded px-1.5 py-0.5">docs/EBAY_CONSIGNMENT_SALES_SPEC.md</span>{" "}
          を参照してください。
        </p>
        <Link href="/admin/ebay/agreements" className="block text-sm text-brand-600 hover:underline">
          委託契約の申請を確認する →
        </Link>
        <Link href="/admin/ebay/settings" className="block text-sm text-brand-600 hover:underline">
          手数料率テーブル・委託期間パターンを設定する →
        </Link>
      </div>
    </div>
  );
}
