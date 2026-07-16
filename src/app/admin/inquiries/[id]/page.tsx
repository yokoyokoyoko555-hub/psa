export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { getInquiryDetail } from "@/actions/inquiry";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import InquiryReplyForm from "../InquiryReplyForm";

export default async function InquiryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inquiry = await getInquiryDetail(id);
  if (!inquiry) notFound();

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/inquiries" className="text-sm text-brand-600 hover:underline">
          ← お問い合わせ一覧
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">{inquiry.subject}</h1>
            {inquiry.resolved && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">完了</span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {format(new Date(inquiry.createdAt), "yyyy年M月d日 HH:mm", { locale: ja })}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-500 text-xs">お名前</dt>
            <dd className="font-medium text-gray-900">{inquiry.customerName}</dd>
          </div>
          <div>
            <dt className="text-gray-500 text-xs">メールアドレス</dt>
            <dd className="font-medium text-gray-900 break-all">{inquiry.customerEmail}</dd>
          </div>
        </dl>

        <Link
          href={`/admin/customers/${inquiry.customerId}`}
          className="inline-block text-sm text-brand-600 hover:underline"
        >
          この顧客の申込一覧を見る →
        </Link>

        <div>
          <p className="text-xs text-gray-500 mb-2">やり取り</p>
          <div className="space-y-3">
            {inquiry.messages.map((message) => (
              <div
                key={message.id}
                className={`rounded-lg border p-4 ${
                  message.sender === "STAFF" ? "bg-brand-50 border-brand-100" : "bg-gray-50 border-gray-200"
                }`}
              >
                <p className={`text-xs font-bold mb-1 ${message.sender === "STAFF" ? "text-brand-700" : "text-gray-500"}`}>
                  {message.sender === "STAFF" ? "スタッフ回答" : "顧客"}
                  <span className="font-normal ml-1">
                    {format(new Date(message.createdAt), "yyyy/MM/dd HH:mm")}
                  </span>
                </p>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{message.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-900">回答</h2>
          {inquiry.repliedAt && (
            <p className="text-xs text-gray-400">
              {format(new Date(inquiry.repliedAt), "yyyy/MM/dd HH:mm")} 回答済み
            </p>
          )}
        </div>
        <InquiryReplyForm
          id={inquiry.id}
          initialReplyText={inquiry.replyText}
          initialResolved={inquiry.resolved}
        />
      </div>
    </div>
  );
}
