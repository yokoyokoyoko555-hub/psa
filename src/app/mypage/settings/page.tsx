export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCustomerSession } from "@/lib/customer-auth";
import { prisma } from "@/lib/prisma";
import { getCustomerProfile } from "@/actions/customer";
import { getMyAddresses } from "@/actions/address";
import AddressManager from "../addresses/AddressManager";
import DeletePaymentMethodButton from "../payment-methods/DeletePaymentMethodButton";
import ProfileSettingsModal from "./ProfileSettingsModal";

export const metadata = { title: "アカウント設定 | トレカビンクス" };

function brandLabel(brand: string) {
  return brand ? brand.toUpperCase() : "CARD";
}

export default async function SettingsPage() {
  const session = await getCustomerSession();
  if (!session) redirect("/login");

  const [profile, addresses, methods] = await Promise.all([
    getCustomerProfile(),
    getMyAddresses(),
    prisma.savedPaymentMethod.findMany({
      where: { customerId: session.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  if (!profile) redirect("/login");

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <Link href="/mypage" className="shrink-0 hover:opacity-70 transition">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpg" alt="トレカビンクス" className="h-12 w-auto" />
          </Link>
          <h1 className="font-bold text-gray-900">アカウント設定</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <ProfileSettingsModal profile={profile} />

        <section id="addresses" className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">返送先情報</h2>
            <p className="text-sm text-gray-500 mt-1">
              申込時に使う返送先住所を登録できます。デフォルト住所が初期選択されます。
            </p>
          </div>
          <AddressManager initialAddresses={addresses} />
        </section>

        <section id="payment-methods" className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">保存済みカード</h2>
            <p className="text-sm text-gray-500 mt-1">
              決済時に保存されたカードを確認・削除できます。カード番号とCVCは当社サーバーには保存されません。
            </p>
          </div>

          {methods.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
              <p className="font-bold text-gray-700">保存済みカードがありません</p>
              <p className="text-sm text-gray-500 mt-1">通常申込の決済後、使用したカードがここに表示されます。</p>
            </div>
          ) : (
            <div className="space-y-3">
              {methods.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-xl border p-5 flex items-center justify-between gap-4 ${
                    m.isDefault ? "border-brand-300 bg-brand-50" : "border-gray-200"
                  }`}
                >
                  <div>
                    <p className="font-bold text-gray-900">
                      {brandLabel(m.brand)} •••• {m.last4}
                      {m.isDefault && (
                        <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-700">
                          既定
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      有効期限 {String(m.expMonth).padStart(2, "0")}/{m.expYear}
                    </p>
                  </div>
                  <DeletePaymentMethodButton methodId={m.id} />
                </div>
              ))}
            </div>
          )}

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs text-gray-500">
            <p>カードの追加は通常申込の決済時に行われます。不要なカードはいつでも削除できます。</p>
            <p>決済情報はStripeによって安全に管理されています。</p>
          </div>
        </section>
      </main>
    </div>
  );
}
