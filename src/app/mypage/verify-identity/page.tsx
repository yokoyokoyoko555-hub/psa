export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCustomerSession } from "@/lib/customer-auth";
import { getMyIdentityVerificationStatus } from "@/actions/identity-verification";
import CustomerHeader from "@/components/CustomerHeader";
import Footer from "@/components/Footer";
import IdentityVerificationForm from "./IdentityVerificationForm";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "審査中",
  APPROVED: "承認済み",
  REJECTED: "却下",
};

/** 本人確認ページ（eBay買取申請の前提。アカウント単位で1回完了させれば以降のカードでは不要）。ADR-0087 */
export default async function VerifyIdentityPage() {
  const customer = await getCustomerSession();
  if (!customer) redirect("/login");

  const { verifiedAt, latest } = await getMyIdentityVerificationStatus();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <CustomerHeader title="本人確認" />
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-8 space-y-6">
        {verifiedAt ? (
          <div className="bg-white rounded-xl border border-green-200 p-6">
            <p className="text-sm text-green-700 font-bold">本人確認は完了しています。</p>
            <p className="text-xs text-gray-500 mt-1">
              完了日時: {new Date(verifiedAt).toLocaleString("ja-JP")}
            </p>
          </div>
        ) : latest && latest.status === "PENDING" ? (
          <div className="bg-white rounded-xl border border-amber-200 p-6">
            <p className="text-sm text-amber-700 font-bold">審査中です。完了までお待ちください。</p>
          </div>
        ) : (
          <>
            {latest?.status === "REJECTED" && (
              <div className="bg-white rounded-xl border border-red-200 p-4">
                <p className="text-sm text-red-700 font-bold">前回の申請は却下されました。</p>
                {latest.rejectionReason && <p className="text-xs text-gray-600 mt-1">理由: {latest.rejectionReason}</p>}
                <p className="text-xs text-gray-500 mt-1">お手数ですが再度ご申請ください。</p>
              </div>
            )}
            <IdentityVerificationForm />
          </>
        )}
        {latest && (
          <p className="text-xs text-gray-400">現在のステータス: {STATUS_LABELS[latest.status] ?? latest.status}</p>
        )}
      </main>
      <Footer />
    </div>
  );
}
