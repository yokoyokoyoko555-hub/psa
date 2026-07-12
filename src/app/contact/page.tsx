export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCustomerProfile } from "@/actions/customer";
import CustomerHeader from "@/components/CustomerHeader";
import Footer from "@/components/Footer";
import ContactForm from "./ContactForm";

export const metadata = { title: "お問い合わせ | トレカビンクス" };

export default async function ContactPage() {
  const profile = await getCustomerProfile();
  if (!profile) redirect("/login");

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <CustomerHeader
        title="お問い合わせ"
        actions={
          <Link href="/contact/history" className="text-sm text-brand-600 hover:underline">
            これまでのお問い合わせ
          </Link>
        }
      />

      <main className="w-full max-w-2xl mx-auto px-4 py-8 flex-1">
        <ContactForm name={profile.name} email={profile.email} />
      </main>

      <Footer />
    </div>
  );
}
