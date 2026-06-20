export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { format } from "date-fns";
import NotificationForm from "./NotificationForm";
import NotificationVisibilityButton from "./NotificationVisibilityButton";

export default async function AdminNotificationsPage() {
  const notifications = await prisma.notification.findMany({
    where: { customerId: null },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <div className="p-8 max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">お知らせ管理</h1>
        <p className="text-sm text-gray-500 mt-1">マイページに表示する全体向けのお知らせを作成します。</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-bold text-gray-900 mb-4">新規作成</h2>
        <NotificationForm />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">最近のお知らせ</h2>
        </div>
        {notifications.length === 0 ? (
          <div className="p-6 text-sm text-gray-400">お知らせはまだありません</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">タイトル</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">作成日</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">マイページ表示</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {notifications.map((n) => (
                <tr key={n.id}>
                  <td className="px-6 py-3 text-gray-900">{n.title}</td>
                  <td className="px-6 py-3 text-gray-500">
                    {format(new Date(n.createdAt), "yyyy.MM.dd")}
                  </td>
                  <td className="px-6 py-3">
                    <NotificationVisibilityButton id={n.id} showOnMypage={n.showOnMypage} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
