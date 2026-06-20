"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateNotificationPublishStatus } from "@/actions/notification";

export default function NotificationPublishButton({
  id,
  isPublished,
}: {
  id: string;
  isPublished: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await updateNotificationPublishStatus({ id, isPublished: !isPublished });
          router.refresh();
        });
      }}
      className={`rounded-full px-3 py-1 text-xs font-bold transition disabled:opacity-50 ${
        isPublished
          ? "bg-green-100 text-green-700 hover:bg-green-200"
          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
      }`}
    >
      {isPublished ? "公開中" : "非公開"}
    </button>
  );
}
