"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upsertSubmissionBooking } from "@/actions/submission-booking";

type BookingMethod = "STORE_DROP_OFF" | "SHIPPING";

type ExistingBooking = {
  id: string;
  method: BookingMethod;
  scheduledAt: string;
  note: string | null;
} | null;

const TIME_SLOTS = ["10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00"];
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function toDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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

export default function BookingForm({
  applicationId,
  existingBooking,
  closedDates,
  shippingDates,
}: {
  applicationId: string;
  existingBooking: ExistingBooking;
  closedDates: string[];
  shippingDates: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [month, setMonth] = useState(() =>
    existingBooking ? new Date(existingBooking.scheduledAt) : new Date(),
  );
  const [method, setMethod] = useState<BookingMethod>(existingBooking?.method ?? "STORE_DROP_OFF");
  const [selectedDate, setSelectedDate] = useState(() =>
    existingBooking ? toDateKey(new Date(existingBooking.scheduledAt)) : toDateKey(new Date()),
  );
  const [time, setTime] = useState(() => {
    if (!existingBooking) return "10:00";
    const d = new Date(existingBooking.scheduledAt);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });
  const [note, setNote] = useState(existingBooking?.note ?? "");
  const [message, setMessage] = useState("");
  const days = useMemo(() => makeMonthDays(month), [month]);
  const todayKey = toDateKey(new Date());

  function moveMonth(offset: number) {
    setMonth((c) => new Date(c.getFullYear(), c.getMonth() + offset, 1));
  }

  function submit() {
    if (closedDates.includes(selectedDate)) {
      setMessage("この日は予約受付不可です。別の日を選択してください");
      return;
    }
    setMessage("");
    startTransition(async () => {
      const result = await upsertSubmissionBooking({
        applicationId,
        method,
        scheduledAt: `${selectedDate}T${time}:00+09:00`,
        note,
      });
      if (result.success) {
        router.push(`/mypage/submission-booking/${applicationId}`);
      } else {
        setMessage(result.error ?? "予約に失敗しました");
      }
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <button type="button" onClick={() => moveMonth(-1)} className="w-9 h-9 rounded-full border border-gray-200 text-gray-600 hover:border-brand-300">
            ‹
          </button>
          <h2 className="font-bold text-gray-900">
            {month.getFullYear()}年 {month.getMonth() + 1}月
          </h2>
          <button type="button" onClick={() => moveMonth(1)} className="w-9 h-9 rounded-full border border-gray-200 text-gray-600 hover:border-brand-300">
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
          {WEEKDAYS.map((w) => (
            <div key={w} className="px-2 py-2 text-center text-xs font-bold text-gray-500">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((date) => {
            const key = toDateKey(date);
            const inMonth = date.getMonth() === month.getMonth();
            const isClosed = closedDates.includes(key);
            const isShippingDay = shippingDates.includes(key);
            const disabled = key < todayKey || isClosed;
            const active = key === selectedDate && !isClosed;
            return (
              <button
                key={key}
                type="button"
                disabled={disabled}
                onClick={() => setSelectedDate(key)}
                className={`min-h-20 border-r border-b border-gray-100 p-2 text-left transition ${
                  isClosed
                    ? "bg-red-50 text-red-300"
                    : active
                    ? "bg-brand-600 text-white"
                    : disabled
                    ? "bg-gray-50 text-gray-300"
                    : inMonth
                    ? "bg-white text-gray-900 hover:bg-brand-50"
                    : "bg-gray-50 text-gray-300"
                }`}
              >
                <span className="text-sm font-bold">{date.getDate()}</span>
                <span className="mt-2 flex flex-wrap gap-1">
                  {isClosed && (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-700">受付不可</span>
                  )}
                  {isShippingDay && (
                    <span className="rounded bg-brand-100 px-1.5 py-0.5 text-[11px] font-bold text-brand-700">発送日</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <aside className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
        <div>
          <p className="text-sm font-bold text-gray-900 mb-2">方法</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: "STORE_DROP_OFF", label: "店頭持込" },
              { value: "SHIPPING", label: "郵送" },
            ].map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setMethod(item.value as BookingMethod)}
                className={`rounded-lg border px-3 py-2 text-sm font-bold ${
                  method === item.value ? "border-brand-600 bg-brand-600 text-white" : "border-gray-200 text-gray-700 hover:border-brand-300"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-bold text-gray-900 mb-2">時間</p>
          <div className="grid grid-cols-3 gap-2">
            {TIME_SLOTS.map((slot) => (
              <button
                key={slot}
                type="button"
                onClick={() => setTime(slot)}
                className={`rounded-lg border px-2 py-2 text-sm font-bold ${
                  time === slot ? "border-brand-600 bg-brand-600 text-white" : "border-gray-200 text-gray-700 hover:border-brand-300"
                }`}
              >
                {slot}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-900 mb-2">備考</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            placeholder="任意"
          />
        </div>

        {message && <p className="text-sm font-bold text-brand-700">{message}</p>}
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="w-full rounded-lg bg-brand-600 px-4 py-3 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {isPending ? "保存中..." : existingBooking ? "予約を更新" : "予約を確定"}
        </button>
      </aside>
    </div>
  );
}
