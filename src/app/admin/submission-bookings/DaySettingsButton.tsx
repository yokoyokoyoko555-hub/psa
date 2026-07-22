"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upsertSubmissionCalendarDay } from "@/actions/submission-booking";
import { TIME_SLOTS } from "@/lib/booking-slots";

export default function DaySettingsButton({
  date,
  align = "right",
  isClosed,
  isShippingDay,
  closedSlots,
  note,
}: {
  date: string;
  /** ポップアップの開く向き。左端（月曜）はrightだとサイドバーに被るためleftを指定する。 */
  align?: "left" | "right";
  isClosed: boolean;
  isShippingDay: boolean;
  closedSlots: string[];
  note: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [closed, setClosed] = useState(isClosed);
  const [shippingDay, setShippingDay] = useState(isShippingDay);
  const [slotsClosed, setSlotsClosed] = useState(closedSlots);
  const [dayNote, setDayNote] = useState(note);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function toggleSlot(slot: string) {
    setSlotsClosed((prev) => (prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot]));
  }

  function save() {
    setMessage("");
    startTransition(async () => {
      const result = await upsertSubmissionCalendarDay({
        date,
        isClosed: closed,
        isShippingDay: shippingDay,
        closedSlots: slotsClosed,
        note: dayNote,
      });
      setMessage(result.success ? "保存しました" : result.error ?? "保存に失敗しました");
      if (result.success) {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] font-bold text-gray-600 hover:border-brand-300"
      >
        設定
      </button>
      {open && (
        <div
          className={`absolute top-8 z-20 w-64 rounded-lg border border-gray-200 bg-white p-3 text-left shadow-lg ${
            align === "left" ? "left-0" : "right-0"
          }`}
        >
          <p className="mb-3 font-bold text-gray-900">{date}</p>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={closed}
              onChange={(event) => setClosed(event.target.checked)}
              className="h-4 w-4 accent-brand-600"
            />
            予約受付不可
          </label>
          <label className="mt-2 flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={shippingDay}
              onChange={(event) => setShippingDay(event.target.checked)}
              className="h-4 w-4 accent-brand-600"
            />
            発送日
          </label>
          <div className="mt-3">
            <p className="mb-1 text-xs font-bold text-gray-700">時間帯（店頭持込のみ受付不可にする）</p>
            <div className="grid grid-cols-4 gap-1">
              {TIME_SLOTS.map((slot) => {
                const active = slotsClosed.includes(slot);
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => toggleSlot(slot)}
                    className={`rounded border px-1 py-1 text-[11px] font-bold ${
                      active ? "border-red-300 bg-red-50 text-red-600" : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {slot}
                  </button>
                );
              })}
            </div>
          </div>
          <textarea
            value={dayNote}
            onChange={(event) => setDayNote(event.target.value)}
            rows={2}
            className="mt-3 w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none"
            placeholder="メモ"
          />
          {message && <p className="mt-2 text-xs font-bold text-brand-700">{message}</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={isPending}
              className="rounded bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {isPending ? "保存中..." : "保存"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded border border-gray-300 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
