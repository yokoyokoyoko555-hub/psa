export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCustomerSession } from "@/lib/customer-auth";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import CustomerHeader from "@/components/CustomerHeader";
import { format } from "date-fns";

export const metadata = { title: "提出予約の詳細 | トレカビンクス" };

const METHOD_LABELS: Record<string, string> = {
  STORE_DROP_OFF: "店頭持込",
  SHIPPING: "郵送",
};

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const customer = await getCustomerSession();
  if (!customer) redirect("/login");

  const { applicationId } = await params;
  const app = await prisma.application.findFirst({
    where: { id: applicationId, customerId: customer.id },
    include: { submissionBooking: true },
  });
  if (!app) redirect("/mypage/submission-booking");

  const booking =
    app.submissionBooking && app.submissionBooking.status === "BOOKED" ? app.submissionBooking : null;
  if (!booking) redirect(`/mypage/submission-booking/${app.id}/edit`);

  const name = decrypt(customer.nameEncrypted);
  const isStore = booking.method === "STORE_DROP_OFF";

  return (
    <div className="min-h-screen bg-gray-50">
      <CustomerHeader title="提出予約の詳細" />

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-5">
        <Link href="/mypage/submission-booking" className="text-sm text-gray-500 hover:text-gray-700">
          ← 予約一覧へ戻る
        </Link>

        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">
          提出予約を受け付けました。{isStore ? "店頭ではこの受付番号のご提示とご本人様確認にて受付します。" : "到着後、スタッフが受け付けます。"}
        </div>

        {/* 受付番号カード */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="bg-brand-600 text-white px-6 py-4">
            <p className="text-sm text-white/80">受付番号</p>
            <p className="text-2xl font-bold tracking-wide">{app.applicationNo}</p>
          </div>

          <div className="px-6 py-4 grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
            <div>
              <p className="text-gray-400">予約日時</p>
              <p className="font-bold text-gray-900">{format(new Date(booking.scheduledAt), "yyyy/MM/dd HH:mm")}</p>
            </div>
            <div>
              <p className="text-gray-400">提出方法</p>
              <p className="font-bold text-gray-900">{METHOD_LABELS[booking.method] ?? booking.method}</p>
            </div>
            <div>
              <p className="text-gray-400">お名前</p>
              <p className="font-bold text-gray-900">{name} 様</p>
            </div>
          </div>

          <div className="px-6 py-4 bg-gray-50 text-xs text-gray-600 leading-relaxed">
            {isStore ? (
              <>
                <p>店頭では、この受付番号の画面提示と本人確認書類（運転免許証等）でのご本人様確認を行います。</p>
                <p className="mt-2">カードは以下の準備をしてご提出お願いいたします。</p>
                <ol className="list-decimal pl-4 mt-1 space-y-1">
                  <li>カードはソフトスリーブにカードを入れ、スリーブに入ったカードをカードセイバーに入れてください。</li>
                  <li>面前にてカードの確認を行いますが、注文ごとにアイテムをグループ分けして番号通りに並べてご提出お願いいたします。</li>
                </ol>
              </>
            ) : (
              <p>郵送でお送りください。到着後、スタッフが受け付けます。</p>
            )}
            <p className="mt-2">※ 提出日時の変更は下のボタンから行えます。</p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Link
            href={`/mypage/submission-booking/${app.id}/edit`}
            className="inline-block border border-gray-300 rounded-lg px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            予約を変更
          </Link>
          <Link
            href={`/mypage/applications/${app.id}`}
            className="inline-block border border-gray-300 rounded-lg px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            申込内容を確認する
          </Link>
        </div>
      </main>
    </div>
  );
}
