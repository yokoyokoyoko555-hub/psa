export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { toJstDisplay } from "@/lib/jst-date";
import { getCustomerSession } from "@/lib/customer-auth";
import { prisma } from "@/lib/prisma";
import CustomerHeader from "@/components/CustomerHeader";
import Footer from "@/components/Footer";

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
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <CustomerHeader title="お知らせ" />

      <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-8">
        <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-brand-600 text-white px-4 py-3">
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
                      {format(toJstDisplay(new Date(n.createdAt)), "yyyy年MM月dd日")}
                    </span>
                    <span
                      className={`block font-bold leading-6 ${
                        n.title.includes("重要") ? "text-brand-700" : "text-brand-600"
                      }`}
                    >
                      {n.title}
                    </span>
                  </span>
                  <span className="text-3xl leading-none text-brand-600 shrink-0">›</span>
                </Link>
              ))
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
