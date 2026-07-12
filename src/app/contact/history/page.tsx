export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCustomerProfile } from "@/actions/customer";
import { getMyInquiries } from "@/actions/inquiry";
import CustomerHeader from "@/components/CustomerHeader";
import Footer from "@/components/Footer";
import { format } from "date-fns";
import { ja } from "date-fns/locale";

export const metadata = { title: "これまでのお問い合わせ | トレカビンクス" };

export default async function ContactHistoryPage() {
  const profile = await getCustomerProfile();
  if (!profile) redirect("/login");

  const inquiries = await getMyInquiries();

  return (
    <div className="min-h-screen bg-gray-50">
      <CustomerHeader
        title="これまでのお問い合わせ"
        actions={
          <Link href="/contact" className="text-sm text-brand-600 hover:underline">
            新しいお問い合わせ →
          </Link>
        }
      />

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-3">
        <p className="text-xs text-gray-500">
          回答をメールでお送りしていますが、届いていない場合はこちらでもご確認いただけます。
        </p>
        {inquiries.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400 text-sm">
            お問い合わせの履歴はありません
          </div>
        ) : (
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
        )}
      </main>

      <Footer />
    </div>
  );
}
