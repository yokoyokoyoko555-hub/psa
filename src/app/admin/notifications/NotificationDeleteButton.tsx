"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteNotification } from "@/actions/notification";

export default function NotificationDeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (!confirm("このお知らせを削除しますか？")) return;
        startTransition(async () => {
          await deleteNotification({ id });
          router.refresh();
        });
      }}
      className="text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
    >
      {isPending ? "削除中..." : "削除"}
    </button>
  );
}
