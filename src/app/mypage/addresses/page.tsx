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
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <Link href="/mypage" className="text-sm text-brand-600 hover:underline">
          ← マイページ
        </Link>
        <h1 className="text-xl font-bold text-gray-900">住所帳</h1>
        <p className="text-sm text-gray-500">
          返送先として使う住所を登録できます。デフォルトに設定した住所が申込時に初期選択されます。
        </p>
        <AddressManager initialAddresses={addresses} />
      </main>
    </div>
  );
}
