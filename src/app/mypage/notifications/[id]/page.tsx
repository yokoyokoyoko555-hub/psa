export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";
import { getCustomerSession } from "@/lib/customer-auth";
import { prisma } from "@/lib/prisma";

export default async function NotificationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const customer = await getCustomerSession();
  if (!customer) redirect("/login");

  const { id } = await params;
  const notification = await prisma.notification.findFirst({
    where: {
      id,
      OR: [{ customerId: null }, { customerId: customer.id }],
    },
  });

  if (!notification) notFound();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <Link href="/mypage" className="shrink-0 hover:opacity-70 transition">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpg" alt="トレカビンクス" className="h-10 w-auto" />
          </Link>
          <h1 className="font-bold text-gray-900">お知らせ</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <article className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-2">
            {format(new Date(notification.createdAt), "yyyy.MM.dd")}
          </p>
          <h2 className="text-xl font-bold text-gray-900 mb-6">{notification.title}</h2>
          <div className="whitespace-pre-wrap text-sm leading-7 text-gray-700">{notification.body}</div>
        </article>
        <Link href="/mypage" className="inline-block mt-6 text-sm text-brand-600 hover:underline">
          マイページへ戻る
        </Link>
      </main>
    </div>
  );
}
