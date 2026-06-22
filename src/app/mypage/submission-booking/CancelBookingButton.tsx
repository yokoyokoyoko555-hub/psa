"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelSubmissionBooking } from "@/actions/submission-booking";

export default function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function go() {
    if (!confirm("この予約をキャンセルしますか？")) return;
    setLoading(true);
    const res = await cancelSubmissionBooking(bookingId);
    setLoading(false);
    if (res.success) {
      router.push("/mypage/submission-booking");
    } else {
      alert(res.error ?? "キャンセルに失敗しました");
    }
  }

  return (
    <button
      onClick={go}
      disabled={loading}
      className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
    >
      {loading ? "..." : "予約をキャンセル"}
    </button>
  );
}
