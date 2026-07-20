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

// サーバーのタイムゾーン（Railway等はUTCが既定でJSTではない）に日付・時刻表示が左右されないよう、
// Dateの現地getterは使わずJST基準で明示的に変換する。書き込み側（actions/submission-booking.ts の
// dateKeyToJstDate）と同じ「JST基準」に統一しないと、カレンダー設定が前日にずれて表示される
// バグになる（設定した日と別の日のマスに表示され、開き直しても実体を編集できなくなる）。
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** "YYYY-MM-DD"（JST）をその瞬間（JST 0時）のDateに変換。actions/submission-booking.tsと同じ定義。 */
function dateKeyToJstDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00+09:00`);
}

/** DateをJST基準の"YYYY-MM-DD"キーに変換 */
function toDateKey(date: Date) {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}-${String(jst.getUTCDate()).padStart(2, "0")}`;
}

/** JST基準でdateKeyにN日加算した"YYYY-MM-DD"キーを返す */
function addDaysToKey(dateKey: string, days: number) {
  return toDateKey(new Date(dateKeyToJstDate(dateKey).getTime() + days * 86400000));
}

/** クエリの週開始日（YYYY-MM-DD）をパースし、その週の月曜（YYYY-MM-DD, JST）を返す。不正・未指定なら今週の月曜。 */
function parseWeekStartKey(value?: string): string {
  const match = value?.match(/^\d{4}-\d{2}-\d{2}$/);
  const baseKey = match ? value! : toDateKey(new Date());
  const baseJst = new Date(dateKeyToJstDate(baseKey).getTime() + JST_OFFSET_MS);
  const dow = baseJst.getUTCDay(); // JST基準の曜日。0=日, 1=月, ..., 6=土
  const diffToMonday = (dow + 6) % 7; // 月曜からの経過日数
  return addDaysToKey(baseKey, -diffToMonday);
}

function formatTime(date: Date) {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  return `${String(jst.getUTCHours()).padStart(2, "0")}:${String(jst.getUTCMinutes()).padStart(2, "0")}`;
}

function formatMonthDay(dateKey: string) {
  const [, m, d] = dateKey.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function yearOfKey(dateKey: string) {
  return Number(dateKey.slice(0, 4));
}

export default async function AdminSubmissionBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const sp = await searchParams;
  const weekStartKey = parseWeekStartKey(sp.week);
  const weekEndKey = addDaysToKey(weekStartKey, 7);
  const prevWeekKey = addDaysToKey(weekStartKey, -7);
  const nextWeekKey = weekEndKey;
  const weekStart = dateKeyToJstDate(weekStartKey);
  const weekEnd = dateKeyToJstDate(weekEndKey);

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

  const dayKeys = Array.from({ length: 7 }, (_, i) => addDaysToKey(weekStartKey, i));
  const weekEndDisplayKey = dayKeys[dayKeys.length - 1];
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
            href={`/admin/submission-bookings?week=${prevWeekKey}`}
            className="w-9 h-9 rounded-full border border-gray-200 text-gray-600 hover:border-brand-300 flex items-center justify-center"
          >
            ‹
          </Link>
          <h2 className="font-bold text-gray-900">
            {yearOfKey(weekStartKey)}年 {formatMonthDay(weekStartKey)} 〜{" "}
            {yearOfKey(weekEndDisplayKey) !== yearOfKey(weekStartKey) ? `${yearOfKey(weekEndDisplayKey)}年 ` : ""}
            {formatMonthDay(weekEndDisplayKey)}
          </h2>
          <Link
            href={`/admin/submission-bookings?week=${nextWeekKey}`}
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
          {dayKeys.map((key) => {
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
                  <span className="text-sm font-bold">{formatMonthDay(key)}</span>
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
