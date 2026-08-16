export const dynamic = "force-dynamic";

import { getCommissionRateTiers, getListingDurationOptions } from "@/actions/ebay-settings";
import CommissionRateTierForm from "./CommissionRateTierForm";
import ListingDurationOptionForm from "./ListingDurationOptionForm";

const groupCls = "bg-white rounded-xl border border-gray-200 p-6";

/**
 * 販売タブの設定画面。現状は手数料率テーブル・買取契約の有効期限パターンのみ、eBayのみ対応。
 * データモデルはプラットフォーム非依存（SalesPlatform）で設計しているため、
 * Fanatics Collect/Goldin等を追加する際はここにプラットフォーム切替を足すだけでよい。ADR-0080/0081
 */
export default async function AdminEbaySettingsPage() {
  const [tiers, durationOptions] = await Promise.all([
    getCommissionRateTiers("EBAY"),
    getListingDurationOptions("EBAY"),
  ]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-gray-900">販売設定</h1>

      <div className={groupCls}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-900">手数料率テーブル（eBay）</h2>
          <span className="text-xs text-gray-400">他プラットフォーム（Fanatics Collect / Goldin）は準備中</span>
        </div>
        <CommissionRateTierForm platform="EBAY" tiers={tiers} />
      </div>

      <div className={groupCls}>
        <h2 className="font-bold text-gray-900 mb-4">買取契約の有効期限パターン（eBay）</h2>
        <ListingDurationOptionForm platform="EBAY" options={durationOptions} />
      </div>
    </div>
  );
}
