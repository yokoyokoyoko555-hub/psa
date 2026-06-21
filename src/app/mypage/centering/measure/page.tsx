export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCustomerSession } from "@/lib/customer-auth";
import { getCenteringAccess } from "@/actions/centering";
import CustomerHeader from "@/components/CustomerHeader";
import MeasureClient from "./MeasureClient";

export const metadata = { title: "センタリング測定 | トレカビンクス" };

export default async function MeasurePage() {
  const customer = await getCustomerSession();
  if (!customer) redirect("/login");

  const hasAccess = await getCenteringAccess();
  if (!hasAccess) redirect("/mypage/centering");

  return (
    <div className="min-h-screen bg-gray-50">
      <CustomerHeader title="センタリング測定" />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <MeasureClient />
      </main>
    </div>
  );
}
