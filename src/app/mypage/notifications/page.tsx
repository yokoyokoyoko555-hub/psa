export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { getCustomerSession } from "@/lib/customer-auth";
import { prisma } from "@/lib/prisma";

export default async function NotificationsPage() {
  const customer = await getCustomerSession();
  if (!customer) redirect("/login");

  const notifications = await prisma.notification.findMany({
    where: {
      isPublished: true,
      showOnMypage: true,
      OR: [{ customerId: null }, { customerId: customer.id }],
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <Link href="/mypage" className="shrink-0 hover:opacity-70 transition">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpg" alt="トレカビンクス" className="h-12 w-auto" />
          </Link>
          <h1 className="font-bold text-gray-900">お知らせ</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <section className="bg-white border border-gray-200">
          <div className="bg-[#00315c] text-white px-4 py-3">
            <h2 className="font-bold">お知らせ</h2>
          </div>
          <div className="divide-y divide-gray-200 px-6">
            {notifications.length === 0 ? (
              <div className="py-6 text-sm text-gray-400">お知らせはありません</div>
            ) : (
              notifications.map((n) => (
                <Link
                  key={n.id}
                  href={`/mypage/notifications/${n.id}`}
                  className="flex items-center justify-between gap-4 py-4 hover:bg-gray-50 transition"
                >
                  <span className="min-w-0">
                    <span className="block text-sm text-gray-900 mb-1">
                      {format(new Date(n.createdAt), "yyyy年MM月dd日")}
                    </span>
                    <span
                      className={`block font-bold leading-6 ${
                        n.title.includes("重要") ? "text-red-600" : "text-blue-600"
                      }`}
                    >
                      {n.title}
                    </span>
                  </span>
                  <span className="text-3xl leading-none text-blue-600 shrink-0">›</span>
                </Link>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
