export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCustomerSession } from "@/lib/customer-auth";
import { prisma } from "@/lib/prisma";
import BookingCalendar from "./BookingCalendar";
import CustomerHeader from "@/components/CustomerHeader";

export const metadata = { title: "カード提出予約 | トレカビンクス" };

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default async function SubmissionBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ applicationId?: string }>;
}) {
  const customer = await getCustomerSession();
  if (!customer) redirect("/login");
  const sp = await searchParams;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const applications = await prisma.application.findMany({
    where: {
      customerId: customer.id,
      status: { notIn: ["DRAFT", "CANCELLED"] },
      payments: { some: { status: "SUCCEEDED" } },
    },
    include: {
      _count: { select: { cards: true } },
      submissionBooking: true,
    },
    orderBy: { createdAt: "desc" },
  });
  const calendarDays = await prisma.submissionCalendarDay.findMany({
    where: { date: { gte: today } },
    orderBy: { date: "asc" },
  });

  const calendarApplications = applications.map((app) => ({
    id: app.id,
    applicationNo: app.applicationNo,
    totalAmount: app.totalAmount,
    cardCount: app._count.cards,
    booking: app.submissionBooking
      ? {
          id: app.submissionBooking.id,
          applicationId: app.submissionBooking.applicationId,
          method: app.submissionBooking.method,
          scheduledAt: app.submissionBooking.scheduledAt.toISOString(),
          status: app.submissionBooking.status,
          note: app.submissionBooking.note,
        }
      : null,
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      <CustomerHeader title="カード提出予約" />

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="font-bold text-gray-900">お支払い後のカード提出日時を予約してください</p>
          <p className="text-sm text-gray-500 mt-1">
            店頭持込、または郵送予定日を選択できます。予約は申込ごとに1件保存されます。
          </p>
        </div>
        <BookingCalendar
          applications={calendarApplications}
          initialApplicationId={sp.applicationId}
          closedDates={calendarDays
            .filter((day) => day.isClosed)
            .map((day) => toDateKey(day.date))}
          shippingDates={calendarDays
            .filter((day) => day.isShippingDay)
            .map((day) => toDateKey(day.date))}
        />
      </main>
    </div>
  );
}
