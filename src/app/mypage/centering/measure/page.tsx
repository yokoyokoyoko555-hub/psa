export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCustomerSession } from "@/lib/customer-auth";
import { getCenteringAccess } from "@/actions/centering";
import { getStoreSettings } from "@/actions/store-settings";
import CustomerHeader from "@/components/CustomerHeader";
import Footer from "@/components/Footer";
import MeasureClient from "./MeasureClient";

export const metadata = { title: "センタリング測定 | トレカビンクス" };

export default async function MeasurePage() {
  const customer = await getCustomerSession();
  if (!customer) redirect("/login");

  // 精度・操作性の改善が済むまで管理画面のスイッチで一時的に非表示にできる。ADR-0070
  const storeSettings = await getStoreSettings();
  if (!(storeSettings?.centeringToolEnabled ?? true)) redirect("/mypage/centering");

  // 手動測定は無料（全ログインユーザー）。AI自動検出のみ加入者向け（ADR-0013）。
  const aiEnabled = await getCenteringAccess();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <CustomerHeader title="センタリング測定" />
      <main className="flex-1 max-w-2xl mx-auto px-4 py-6">
        <MeasureClient aiEnabled={aiEnabled} />
      </main>
      <Footer />
    </div>
  );
}
