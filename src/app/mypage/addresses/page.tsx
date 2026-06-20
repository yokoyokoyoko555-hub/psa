export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCustomerSession } from "@/lib/customer-auth";
import { getMyAddresses } from "@/actions/address";
import AddressManager from "./AddressManager";

export default async function AddressesPage() {
  const customer = await getCustomerSession();
  if (!customer) redirect("/login");

  const addresses = await getMyAddresses();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <Link href="/mypage" className="shrink-0 hover:opacity-70 transition">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpg" alt="トレカビンクス" className="h-12 w-auto" />
          </Link>
          <h1 className="font-bold text-gray-900">返送先情報</h1>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <p className="text-sm text-gray-500">
          返送先として使う住所を登録できます。デフォルトに設定した住所が申込時に初期選択されます。
        </p>
        <AddressManager initialAddresses={addresses} />
      </main>
    </div>
  );
}
