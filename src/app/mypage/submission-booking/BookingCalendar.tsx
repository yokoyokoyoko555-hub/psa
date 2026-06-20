"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelSubmissionBooking, upsertSubmissionBooking } from "@/actions/submission-booking";

type BookingMethod = "STORE_DROP_OFF" | "SHIPPING";

type Booking = {
  id: string;
  applicationId: string;
  method: BookingMethod;
  scheduledAt: string;
  status: string;
  note: string | null;
};

type ApplicationOption = {
  id: string;
  applicationNo: string;
  totalAmount: number;
  cardCount: number;
  booking: Booking | null;
};

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

function formatBooking(iso: string) {
  const date = new Date(iso);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function BookingCalendar({ applications }: { applications: ApplicationOption[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [month, setMonth] = useState(() => new Date());
  const [applicationId, setApplicationId] = useState(applications[0]?.id ?? "");
  const selectedApp = applications.find((a) => a.id === applicationId);
  const existingBooking = selectedApp?.booking?.status === "BOOKED" ? selectedApp.booking : null;
  const [method, setMethod] = useState<BookingMethod>(existingBooking?.method ?? "STORE_DROP_OFF");
  const [selectedDate, setSelectedDate] = useState(() => {
    if (existingBooking) return toDateKey(new Date(existingBooking.scheduledAt));
    return toDateKey(new Date());
  });
  const [time, setTime] = useState(() => {
    if (!existingBooking) return "10:00";
    const date = new Date(existingBooking.scheduledAt);
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  });
  const [note, setNote] = useState(existingBooking?.note ?? "");
  const [message, setMessage] = useState("");
  const days = useMemo(() => makeMonthDays(month), [month]);
  const todayKey = toDateKey(new Date());

  function moveMonth(offset: number) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  function submit() {
    if (!applicationId) return;
    setMessage("");
    startTransition(async () => {
      const result = await upsertSubmissionBooking({
        applicationId,
        method,
        scheduledAt: `${selectedDate}T${time}:00+09:00`,
        note,
      });
      setMessage(result.success ? "予約を保存しました" : result.error ?? "予約に失敗しました");
      if (result.success) router.refresh();
    });
  }

  function cancel() {
    if (!existingBooking || !confirm("この予約をキャンセルしますか？")) return;
    setMessage("");
    startTransition(async () => {
      const result = await cancelSubmissionBooking(existingBooking.id);
      setMessage(result.success ? "予約をキャンセルしました" : result.error ?? "キャンセルに失敗しました");
      if (result.success) router.refresh();
    });
  }

  if (applications.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
        <p className="font-bold text-gray-900">予約できる支払済み申込がありません</p>
        <p className="text-sm text-gray-500 mt-2">お支払い完了後に、カードの店頭持込または郵送予定を予約できます。</p>
      </div>
    );
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
            const disabled = key < todayKey;
            const active = key === selectedDate;
            return (
              <button
                key={key}
                type="button"
                disabled={disabled}
                onClick={() => setSelectedDate(key)}
                className={`min-h-20 border-r border-b border-gray-100 p-2 text-left transition ${
                  active
                    ? "bg-brand-600 text-white"
                    : disabled
                    ? "bg-gray-50 text-gray-300"
                    : inMonth
                    ? "bg-white text-gray-900 hover:bg-brand-50"
                    : "bg-gray-50 text-gray-300"
                }`}
              >
                <span className="text-sm font-bold">{date.getDate()}</span>
              </button>
            );
          })}
        </div>
      </section>

      <aside className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
        <div>
          <label className="block text-sm font-bold text-gray-900 mb-2">申込</label>
          <select
            value={applicationId}
            onChange={(event) => setApplicationId(event.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          >
            {applications.map((app) => (
              <option key={app.id} value={app.id}>
                {app.applicationNo} / {app.cardCount}枚
              </option>
            ))}
          </select>
        </div>

        {existingBooking && (
          <div className="rounded-lg border border-brand-100 bg-brand-50 p-3 text-sm">
            <p className="font-bold text-brand-700">現在の予約</p>
            <p className="text-gray-700 mt-1">{formatBooking(existingBooking.scheduledAt)}</p>
            <p className="text-gray-600">{existingBooking.method === "STORE_DROP_OFF" ? "店頭持込" : "郵送予定"}</p>
          </div>
        )}

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
            onChange={(event) => setNote(event.target.value)}
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
          {isPending ? "保存中..." : "予約を保存"}
        </button>
        {existingBooking && (
          <button
            type="button"
            onClick={cancel}
            disabled={isPending}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            予約をキャンセル
          </button>
        )}
      </aside>
    </div>
  );
}
