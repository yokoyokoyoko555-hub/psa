export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCustomerProfile } from "@/actions/customer";
import { getMyInquiries } from "@/actions/inquiry";
import CustomerHeader from "@/components/CustomerHeader";
import Footer from "@/components/Footer";
import ContactForm from "./ContactForm";
import { format } from "date-fns";
import { ja } from "date-fns/locale";

export const metadata = { title: "お問い合わせ | トレカビンクス" };

export default async function ContactPage() {
  const profile = await getCustomerProfile();
  if (!profile) redirect("/login");

  const inquiries = await getMyInquiries();

  return (
    <div className="min-h-screen bg-gray-50">
      <CustomerHeader title="お問い合わせ" />

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        {inquiries.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">これまでのお問い合わせ</h2>
            <p className="text-xs text-gray-500">
              回答をメールでお送りしていますが、届いていない場合はこちらでもご確認いただけます。
            </p>
            <div className="space-y-3">
              {inquiries.map((inq) => (
                <div key={inq.id} className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <p className="font-bold text-gray-900">{inq.subject}</p>
                    <span
                      className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
                        inq.status === "REPLIED" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {inq.status === "REPLIED" ? "回答済み" : "回答待ち"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mb-2">
                    {format(new Date(inq.createdAt), "yyyy年M月d日 HH:mm", { locale: ja })}
                  </p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap mb-3">{inq.body}</p>
                  {inq.replyText && (
                    <div className="bg-brand-50 border border-brand-100 rounded-lg p-3">
                      <p className="text-xs text-brand-700 font-bold mb-1">
                        回答
                        {inq.repliedAt && `（${format(new Date(inq.repliedAt), "yyyy年M月d日 HH:mm", { locale: ja })}）`}
                      </p>
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">{inq.replyText}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-3">
            {inquiries.length > 0 ? "新しいお問い合わせ" : "お問い合わせ"}
          </h2>
          <ContactForm name={profile.name} email={profile.email} />
        </section>
      </main>

      <Footer />
    </div>
  );
}
