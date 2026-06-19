export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCustomerSession } from "@/lib/customer-auth";
import { prisma } from "@/lib/prisma";
import DeletePaymentMethodButton from "./DeletePaymentMethodButton";

export const metadata = { title: "支払い方法管理 | トレカビンクス" };

export default async function PaymentMethodsPage() {
  const session = await getCustomerSession();
  if (!session) redirect("/login");

  const methods = await prisma.savedPaymentMethod.findMany({
    where: { customerId: session.id },
    orderBy: { isDefault: "desc" },
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <Link href="/mypage" className="text-gray-500 hover:text-gray-700">← マイページ</Link>
          <h1 className="font-bold text-gray-900">支払い方法</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-4">
        {methods.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-4xl mb-3">💳</p>
            <p className="text-gray-600 font-medium">登録済みの支払い方法がありません</p>
            <p className="text-sm text-gray-400 mt-1">
              PSA申込時に決済すると自動的に保存されます
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500">
              登録済みのカード情報はUpcharge発生時の自動決済に使用されます。
            </p>
            {methods.map((m) => (
              <div
                key={m.id}
                className={`bg-white rounded-xl border p-5 flex items-center justify-between ${
                  m.isDefault ? "border-brand-300" : "border-gray-200"
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-8 bg-gray-100 rounded flex items-center justify-center text-lg">
                    {m.brand === "visa"
                      ? "V"
                      : m.brand === "mastercard"
                      ? "M"
                      : m.brand === "amex"
                      ? "A"
                      : "💳"}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 capitalize">
                      {m.brand} •••• {m.last4}
                      {m.isDefault && (
                        <span className="ml-2 text-xs bg-brand-100 text-brand-600 px-2 py-0.5 rounded-full">
                          デフォルト
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-gray-500">
                      有効期限: {m.expMonth.toString().padStart(2, "0")}/{m.expYear}
                    </p>
                  </div>
                </div>
                <DeletePaymentMethodButton methodId={m.id} />
              </div>
            ))}

            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 text-xs text-gray-500">
              <p>• カード番号・CVCは当社サーバーに保存されていません</p>
              <p>• 決済情報はStripeによって安全に管理されています</p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
