"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelSubmissionBookingByAdmin } from "@/actions/submission-booking";

export default function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm("この予約をキャンセルしますか？")) return;
    startTransition(async () => {
      await cancelSubmissionBookingByAdmin(bookingId);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="text-xs font-bold text-red-600 hover:underline disabled:opacity-60"
    >
      {isPending ? "取消中..." : "取消"}
    </button>
  );
}
