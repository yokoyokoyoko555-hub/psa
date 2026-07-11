export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import CancelBookingButton from "./CancelBookingButton";
import DaySettingsButton from "./DaySettingsButton";

export const metadata = { title: "提出予約カレンダー | 管理画面" };

// 月曜始まりの週表示。ADR-0064
const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];
const METHOD_LABELS: Record<string, string> = {
  STORE_DROP_OFF: "店頭持込",
  SHIPPING: "郵送",
};

/** クエリの週開始日（YYYY-MM-DD）をパースし、その週の月曜0時を返す。不正・未指定なら今週の月曜。 */
function parseWeekStart(value?: string): Date {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const base = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date();
  const dow = base.getDay(); // 0=日, 1=月, ..., 6=土
  const diffToMonday = (dow + 6) % 7; // 月曜からの経過日数
  const monday = new Date(base.getFullYear(), base.getMonth(), base.getDate() - diffToMonday);
  return monday;
}

function toDateParam(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function toDateKey(date: Date) {
  return toDateParam(date);
}

function makeWeekDays(weekStart: Date) {
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    return date;
  });
}

function formatTime(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatMonthDay(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export default async function AdminSubmissionBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const sp = await searchParams;
  const weekStart = parseWeekStart(sp.week);
  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7);
  const prevWeek = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() - 7);
  const nextWeek = weekEnd;

  const [bookings, calendarDays] = await Promise.all([
    prisma.submissionBooking.findMany({
      where: {
        scheduledAt: { gte: weekStart, lt: weekEnd },
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
    }),
    prisma.submissionCalendarDay.findMany({
      where: { date: { gte: weekStart, lt: weekEnd } },
    }),
  ]);

  const grouped = new Map<string, typeof bookings>();
  for (const booking of bookings) {
    const key = toDateKey(new Date(booking.scheduledAt));
    grouped.set(key, [...(grouped.get(key) ?? []), booking]);
  }
  const settingsByDate = new Map(calendarDays.map((day) => [toDateKey(new Date(day.date)), day]));

  const days = makeWeekDays(weekStart);
  const weekEndDisplay = days[days.length - 1];
  const bookedCount = bookings.filter((b) => b.status === "BOOKED").length;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">提出予約カレンダー</h1>
          <p className="text-sm text-gray-500 mt-1">店頭持込・郵送予定の予約を週間表示します（月曜始まり）</p>
        </div>
        <div className="text-sm text-gray-500">予約中 {bookedCount}件</div>
      </div>

      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <Link
            href={`/admin/submission-bookings?week=${toDateParam(prevWeek)}`}
            className="w-9 h-9 rounded-full border border-gray-200 text-gray-600 hover:border-brand-300 flex items-center justify-center"
          >
            ‹
          </Link>
          <h2 className="font-bold text-gray-900">
            {weekStart.getFullYear()}年 {formatMonthDay(weekStart)} 〜{" "}
            {weekEndDisplay.getFullYear() !== weekStart.getFullYear() ? `${weekEndDisplay.getFullYear()}年 ` : ""}
            {formatMonthDay(weekEndDisplay)}
          </h2>
          <Link
            href={`/admin/submission-bookings?week=${toDateParam(nextWeek)}`}
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
            const daySetting = settingsByDate.get(key);
            return (
              <div
                key={key}
                className={`min-h-[28rem] border-r border-b border-gray-100 p-2 ${
                  daySetting?.isClosed ? "bg-red-50" : "bg-white"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">{formatMonthDay(date)}</span>
                  <DaySettingsButton
                    date={key}
                    isClosed={daySetting?.isClosed ?? false}
                    isShippingDay={daySetting?.isShippingDay ?? false}
                    note={daySetting?.note ?? ""}
                  />
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {daySetting?.isClosed && (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-700">
                      受付不可
                    </span>
                  )}
                  {daySetting?.isShippingDay && (
                    <span className="rounded bg-brand-100 px-1.5 py-0.5 text-[11px] font-bold text-brand-700">
                      発送日
                    </span>
                  )}
                  {dayBookings.length > 0 && (
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-bold text-gray-700">
                      {dayBookings.length}件
                    </span>
                  )}
                </div>
                {daySetting?.note && <p className="mt-1 line-clamp-2 text-[11px] text-gray-500">{daySetting.note}</p>}
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
