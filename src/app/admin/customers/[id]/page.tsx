export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { formatMoney } from "@/lib/currency";

export default async function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [customer, applications, savedMethods] = await Promise.all([
    prisma.customer.findUnique({ where: { id } }),
    prisma.application.findMany({
      where: { customerId: id },
      orderBy: { createdAt: "desc" },
      include: { cards: { select: { id: true } } },
    }),
    prisma.savedPaymentMethod.findMany({
      where: { customerId: id },
      orderBy: { isDefault: "desc" },
    }),
  ]);

  if (!customer) notFound();

  const name = decrypt(customer.nameEncrypted);
  const phone = decrypt(customer.phoneEncrypted);
  const address = decrypt(customer.addressEncrypted);
  const address2 = customer.address2Encrypted ? decrypt(customer.address2Encrypted) : "";

  const totalSpent = applications.reduce((s, a) => s + a.totalAmount, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/customers" className="text-sm text-brand-600 hover:underline">
          ← 顧客一覧
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-brand-100 rounded-full flex items-center justify-center text-xl font-bold text-brand-600">
                {name.charAt(0)}
              </div>
              <div>
                <h1 className="font-bold text-gray-900">{name}</h1>
                <p className="text-xs text-gray-500">
                  登録: {format(new Date(customer.createdAt), "yyyy/M/d", { locale: ja })}
                </p>
              </div>
            </div>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-gray-500 text-xs">メール</dt>
                <dd className="text-gray-900 break-all">{customer.email}</dd>
              </div>
              <div>
                <dt className="text-gray-500 text-xs">電話番号</dt>
                <dd className="font-medium">{phone}</dd>
              </div>
              <div>
                <dt className="text-gray-500 text-xs">住所</dt>
                <dd className="text-gray-900">
                  〒{customer.postalCode}<br />
                  {address}{address2 ? ` ${address2}` : ""}
                </dd>
              </div>
            </dl>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-bold text-gray-900 mb-3">サマリー</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">申込件数</dt>
                <dd className="font-medium">{applications.length}件</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">累計お支払い</dt>
                <dd className="font-bold text-gray-900">¥{totalSpent.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Stripe顧客ID</dt>
                <dd className="font-mono text-xs text-gray-500 break-all">
                  {customer.stripeCustomerId ?? "-"}
                </dd>
              </div>
            </dl>
          </div>

          {savedMethods.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-bold text-gray-900 mb-3">登録支払い方法</h2>
              <div className="space-y-2">
                {savedMethods.map((m) => (
                  <div key={m.id} className="flex items-center justify-between text-sm">
                    <span className="capitalize">
                      {m.brand} •••• {m.last4}
                      {m.isDefault && <span className="ml-1 text-xs text-brand-600">(デフォルト)</span>}
                    </span>
                    <span className="text-gray-400 text-xs">{m.expMonth}/{m.expYear}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-2">
          <h2 className="font-bold text-gray-900 mb-4">申込履歴</h2>
          {applications.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
              申込なし
            </div>
          ) : (
            <div className="space-y-3">
              {applications.map((app) => (
                <Link
                  key={app.id}
                  href={`/admin/applications/${app.id}`}
                  className="bg-white rounded-xl border border-gray-200 p-5 hover:border-brand-300 transition block"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="font-mono text-sm text-gray-500">{app.applicationNo}</span>
                      <span className="ml-3 text-sm font-medium text-gray-900">
                        {app.cards.length}枚
                      </span>
                    </div>
                    <div className="text-right">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        app.status === "COMPLETED" ? "bg-green-100 text-green-700" :
                        app.status === "CANCELLED" ? "bg-gray-100 text-gray-600" :
                        "bg-brand-100 text-brand-700"
                      }`}>
                        {app.status}
                      </span>
                      <p className="text-sm font-bold text-gray-900 mt-1">
                        {formatMoney(app.totalAmount, app.region)}
                      </p>
                    </div>
                  </div>
                  <div className="text-xs text-gray-400">
                    {app.serviceLevel} / {app.returnMethod === "STORE_PICKUP" ? "店頭受取" : "配送"} / {format(new Date(app.createdAt), "yyyy/M/d", { locale: ja })}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
