export const dynamic = "force-dynamic";

import { getAdminCustomers } from "@/actions/admin";

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const customers = await getAdminCustomers({
    search: sp.search,
    page: sp.page ? parseInt(sp.page) : 1,
  });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">顧客管理</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <form className="flex gap-3">
          <input
            type="text"
            name="search"
            defaultValue={sp.search}
            placeholder="メールアドレスで検索"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
          >
            検索
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">氏名</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">メール</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">申込件数</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">累計金額</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {customers.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{c.name}</p>
                  <p className="text-xs text-gray-400">{c.nameKana}</p>
                </td>
                <td className="px-4 py-3 text-gray-600">{c.email}</td>
                <td className="px-4 py-3 text-gray-700">{c.applicationCount}件</td>
                <td className="px-4 py-3 font-medium text-gray-900">¥{c.totalAmount.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
