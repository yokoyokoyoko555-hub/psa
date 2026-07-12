export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCustomerProfile } from "@/actions/customer";
import { getMyInquiries } from "@/actions/inquiry";
import CustomerHeader from "@/components/CustomerHeader";
import Footer from "@/components/Footer";
import ContactHistoryList from "./ContactHistoryList";

export const metadata = { title: "これまでのお問い合わせ | トレカビンクス" };

export default async function ContactHistoryPage() {
  const profile = await getCustomerProfile();
  if (!profile) redirect("/login");

  const inquiries = await getMyInquiries();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <CustomerHeader
        title="これまでのお問い合わせ"
        actions={
          <Link href="/contact" className="text-sm text-brand-600 hover:underline">
            新しいお問い合わせ
          </Link>
        }
      />

      <main className="w-full max-w-2xl mx-auto px-4 py-8 space-y-3 flex-1">
        <p className="text-xs text-gray-500">
          回答をメールでお送りしていますが、届いていない場合はこちらでもご確認いただけます。
        </p>
        <ContactHistoryList inquiries={inquiries} />
      </main>

      <Footer />
    </div>
  );
}
