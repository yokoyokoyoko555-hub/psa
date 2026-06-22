export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCustomerSession } from "@/lib/customer-auth";
import { prisma } from "@/lib/prisma";
import CustomerHeader from "@/components/CustomerHeader";
import { format } from "date-fns";

export const metadata = { title: "カード提出予約 | トレカビンクス" };

const METHOD_LABELS: Record<string, string> = {
  STORE_DROP_OFF: "店頭持込",
  SHIPPING: "郵送",
};

export default async function SubmissionBookingPage() {
  const customer = await getCustomerSession();
  if (!customer) redirect("/login");

  // 代理申込(STORE)はお預け予約が先のため支払い前でも対象。通常(CUSTOMER)は支払い済みのみ。
  const applications = await prisma.application.findMany({
    where: {
      customerId: customer.id,
      OR: [
        { source: "STORE", status: { not: "CANCELLED" } },
        {
          source: "CUSTOMER",
          status: { notIn: ["DRAFT", "CANCELLED"] },
          payments: { some: { status: "SUCCEEDED" } },
        },
      ],
    },
    include: {
      _count: { select: { cards: true } },
      submissionBooking: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <CustomerHeader title="カード提出予約" />

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="font-bold text-gray-900">申込ごとに、カードの提出方法と日時を予約してください</p>
          <p className="text-sm text-gray-500 mt-1">
            店頭持込または郵送予定日を選べます。予約は申込ごとに1件です。
          </p>
        </div>

        {applications.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
            <p className="font-bold text-gray-900">予約できる支払済み申込がありません</p>
            <p className="text-sm text-gray-500 mt-2">お支払い完了後に、こちらで提出日時を予約できます。</p>
          </div>
        ) : (
          <div className="space-y-3">
            {applications.map((app) => {
              const booked =
                app.submissionBooking && app.submissionBooking.status === "BOOKED"
                  ? app.submissionBooking
                  : null;
              return (
                <div
                  key={app.id}
                  className="bg-white border border-gray-200 rounded-xl p-5 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900">{app.applicationNo}</p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {app.source === "STORE" && app._count.cards === 0
                        ? "代理入力（スタッフが明細を入力します）"
                        : `${app._count.cards}枚 ・ ¥${app.totalAmount.toLocaleString()}`}
                    </p>
                    {booked ? (
                      <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                        <span className="rounded-full bg-brand-50 text-brand-700 px-2 py-0.5 text-xs font-bold">
                          予約済
                        </span>
                        <span className="text-gray-700">
                          {format(new Date(booked.scheduledAt), "yyyy/MM/dd HH:mm")} ・{" "}
                          {METHOD_LABELS[booked.method] ?? booked.method}
                        </span>
                      </p>
                    ) : (
                      <span className="mt-2 inline-block rounded-full bg-yellow-50 text-yellow-700 px-2 py-0.5 text-xs font-bold">
                        未予約
                      </span>
                    )}
                  </div>
                  <div className="shrink-0">
                    {booked ? (
                      <Link
                        href={`/mypage/submission-booking/${app.id}`}
                        className="inline-block border border-gray-300 rounded-lg px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
                      >
                        予約を見る
                      </Link>
                    ) : (
                      <Link
                        href={`/mypage/submission-booking/${app.id}/edit`}
                        className="inline-block bg-brand-600 text-white rounded-lg px-4 py-2 text-sm font-bold hover:bg-brand-700"
                      >
                        予約する
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
