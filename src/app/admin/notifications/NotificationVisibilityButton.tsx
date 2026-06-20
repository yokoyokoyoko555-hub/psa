"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateNotificationVisibility } from "@/actions/notification";

export default function NotificationVisibilityButton({
  id,
  showOnMypage,
}: {
  id: string;
  showOnMypage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await updateNotificationVisibility({ id, showOnMypage: !showOnMypage });
          router.refresh();
        });
      }}
      className={`rounded-full px-3 py-1 text-xs font-bold transition disabled:opacity-50 ${
        showOnMypage
          ? "bg-brand-100 text-brand-700 hover:bg-brand-200"
          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
      }`}
    >
      {showOnMypage ? "表示中" : "非表示"}
    </button>
  );
}
