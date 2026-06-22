export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCustomerSession } from "@/lib/customer-auth";
import { prisma } from "@/lib/prisma";
import CustomerHeader from "@/components/CustomerHeader";
import BookingForm from "../../BookingForm";

export const metadata = { title: "カード提出予約 | トレカビンクス" };

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default async function EditBookingPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const customer = await getCustomerSession();
  if (!customer) redirect("/login");

  const { applicationId } = await params;
  const app = await prisma.application.findFirst({
    where: {
      id: applicationId,
      customerId: customer.id,
      status: { notIn: ["DRAFT", "CANCELLED"] },
      payments: { some: { status: "SUCCEEDED" } },
    },
    include: { submissionBooking: true, _count: { select: { cards: true } } },
  });
  if (!app) redirect("/mypage/submission-booking");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const calendarDays = await prisma.submissionCalendarDay.findMany({
    where: { date: { gte: today } },
    orderBy: { date: "asc" },
  });

  const booking =
    app.submissionBooking && app.submissionBooking.status === "BOOKED"
      ? {
          id: app.submissionBooking.id,
          method: app.submissionBooking.method,
          scheduledAt: app.submissionBooking.scheduledAt.toISOString(),
          note: app.submissionBooking.note,
        }
      : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <CustomerHeader title="カード提出予約" />

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-5">
        <Link href="/mypage/submission-booking" className="text-sm text-gray-500 hover:text-gray-700">
          ← 予約一覧へ戻る
        </Link>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="font-bold text-gray-900">{app.applicationNo}</p>
          <p className="text-sm text-gray-500 mt-0.5">{app._count.cards}枚 ・ ¥{app.totalAmount.toLocaleString()}</p>
        </div>
        <BookingForm
          applicationId={app.id}
          existingBooking={booking}
          closedDates={calendarDays.filter((d) => d.isClosed).map((d) => toDateKey(d.date))}
          shippingDates={calendarDays.filter((d) => d.isShippingDay).map((d) => toDateKey(d.date))}
        />
      </main>
    </div>
  );
}
