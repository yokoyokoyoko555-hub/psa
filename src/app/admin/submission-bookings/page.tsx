export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import CancelBookingButton from "./CancelBookingButton";

export const metadata = { title: "提出予約カレンダー | 管理画面" };

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const METHOD_LABELS: Record<string, string> = {
  STORE_DROP_OFF: "店頭持込",
  SHIPPING: "郵送",
};

function parseMonth(value?: string) {
  const match = value?.match(/^(\d{4})-(\d{2})$/);
  if (!match) return new Date();
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  if (!Number.isInteger(year) || !Number.isInteger(month)) return new Date();
  return new Date(year, month, 1);
}

function toMonthParam(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function makeMonthDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    return date;
  });
}

function formatTime(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default async function AdminSubmissionBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const month = parseMonth(sp.month);
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const prevMonth = new Date(month.getFullYear(), month.getMonth() - 1, 1);
  const nextMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1);

  const bookings = await prisma.submissionBooking.findMany({
    where: {
      scheduledAt: { gte: monthStart, lt: monthEnd },
    },
    include: {
      customer: { select: { nameEncrypted: true, email: true } },
      application: {
        select: {
          id: true,
          applicationNo: true,
          totalAmount: true,
          _count: { select: { cards: true } },
        },
      },
    },
    orderBy: { scheduledAt: "asc" },
  });

  const grouped = new Map<string, typeof bookings>();
  for (const booking of bookings) {
    const key = toDateKey(new Date(booking.scheduledAt));
    grouped.set(key, [...(grouped.get(key) ?? []), booking]);
  }

  const days = makeMonthDays(month);
  const bookedCount = bookings.filter((b) => b.status === "BOOKED").length;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">提出予約カレンダー</h1>
          <p className="text-sm text-gray-500 mt-1">店頭持込・郵送予定の予約を月間表示します</p>
        </div>
        <div className="text-sm text-gray-500">予約中 {bookedCount}件</div>
      </div>

      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <Link
            href={`/admin/submission-bookings?month=${toMonthParam(prevMonth)}`}
            className="w-9 h-9 rounded-full border border-gray-200 text-gray-600 hover:border-brand-300 flex items-center justify-center"
          >
            ‹
          </Link>
          <h2 className="font-bold text-gray-900">
            {month.getFullYear()}年 {month.getMonth() + 1}月
          </h2>
          <Link
            href={`/admin/submission-bookings?month=${toMonthParam(nextMonth)}`}
            className="w-9 h-9 rounded-full border border-gray-200 text-gray-600 hover:border-brand-300 flex items-center justify-center"
          >
            ›
          </Link>
        </div>

        <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-100">
          {WEEKDAYS.map((w) => (
            <div key={w} className="px-2 py-2 text-center text-xs font-bold text-gray-500">
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((date) => {
            const key = toDateKey(date);
            const dayBookings = grouped.get(key) ?? [];
            const inMonth = date.getMonth() === month.getMonth();
            return (
              <div
                key={key}
                className={`min-h-36 border-r border-b border-gray-100 p-2 ${
                  inMonth ? "bg-white" : "bg-gray-50 text-gray-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">{date.getDate()}</span>
                  {dayBookings.length > 0 && (
                    <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-700">
                      {dayBookings.length}
                    </span>
                  )}
                </div>
                <div className="mt-2 space-y-2">
                  {dayBookings.map((booking) => {
                    const isCancelled = booking.status === "CANCELLED";
                    return (
                      <div
                        key={booking.id}
                        className={`rounded-lg border p-2 text-xs ${
                          isCancelled
                            ? "border-gray-200 bg-gray-50 text-gray-400"
                            : "border-brand-100 bg-brand-50 text-gray-800"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-brand-700">
                            {formatTime(new Date(booking.scheduledAt))}
                          </span>
                          <span className="shrink-0">{METHOD_LABELS[booking.method] ?? booking.method}</span>
                        </div>
                        <Link
                          href={`/admin/applications/${booking.application.id}`}
                          className="mt-1 block font-mono text-[11px] text-brand-700 hover:underline"
                        >
                          {booking.application.applicationNo}
                        </Link>
                        <p className="mt-1 font-bold text-gray-900">
                          {decrypt(booking.customer.nameEncrypted)}
                        </p>
                        <p className="truncate text-gray-500">{booking.customer.email}</p>
                        <p className="mt-1 text-gray-500">{booking.application._count.cards}枚</p>
                        {booking.note && <p className="mt-1 text-gray-500 line-clamp-2">{booking.note}</p>}
                        <div className="mt-2 flex items-center justify-between">
                          <span>{isCancelled ? "キャンセル済み" : "予約中"}</span>
                          {!isCancelled && <CancelBookingButton bookingId={booking.id} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
