export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import NotificationForm from "../NotificationForm";

export default async function AdminNotificationEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification) notFound();

  return (
    <div className="p-8 max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/notifications" className="text-sm text-brand-600 hover:underline">
          ← お知らせ管理
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold text-gray-900">お知らせ編集</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <NotificationForm
          initial={{
            id: notification.id,
            title: notification.title,
            body: notification.body,
            showOnMypage: notification.showOnMypage,
            isPublished: notification.isPublished,
          }}
        />
      </div>
    </div>
  );
}
