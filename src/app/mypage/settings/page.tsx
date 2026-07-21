export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCustomerSession } from "@/lib/customer-auth";
import { prisma } from "@/lib/prisma";
import { getCustomerProfile } from "@/actions/customer";
import { getMyAddresses } from "@/actions/address";
import { dedupeSavedPaymentMethods } from "@/actions/payment";
import AddressManager from "../addresses/AddressManager";
import DeletePaymentMethodButton from "../payment-methods/DeletePaymentMethodButton";
import ProfileSettingsModal from "./ProfileSettingsModal";
import ChangePasswordForm from "./ChangePasswordForm";
import CustomerHeader from "@/components/CustomerHeader";
import Footer from "@/components/Footer";
import { logoutCustomer } from "@/actions/customer";

export const metadata = { title: "アカウント設定 | トレカビンクス" };

function brandLabel(brand: string) {
  return brand ? brand.toUpperCase() : "CARD";
}

export default async function SettingsPage() {
  const session = await getCustomerSession();
  if (!session) redirect("/login");

  // 過去の重複バグで登録された保存済みカードを表示前に整理する。ADR-0048
  await dedupeSavedPaymentMethods();

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
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <CustomerHeader title="アカウント設定" />

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-8 space-y-6">
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

        <section id="password" className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">パスワードの変更</h2>
            <p className="text-sm text-gray-500 mt-1">
              ログインに使用するパスワードを変更します。
            </p>
          </div>
          <ChangePasswordForm />
        </section>

        <section id="logout" className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">ログアウト</h2>
              <p className="text-sm text-gray-500 mt-1">この端末からログアウトします。</p>
            </div>
            <form action={logoutCustomer}>
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50"
              >
                ログアウト
              </button>
            </form>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
