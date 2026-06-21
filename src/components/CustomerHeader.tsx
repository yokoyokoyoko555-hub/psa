import Link from "next/link";
import type { ReactNode } from "react";
import { getCustomerSession } from "@/lib/customer-auth";
import { decrypt } from "@/lib/crypto";
import { logoutCustomer } from "@/actions/customer";

type Props = {
  title?: string;
  actions?: ReactNode;
};

export default async function CustomerHeader({ title, actions }: Props) {
  const customer = await getCustomerSession();
  const name = customer ? decrypt(customer.nameEncrypted) : null;

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-10 px-4 py-3">
      <div className="max-w-6xl mx-auto flex items-center gap-4">
        <Link href={customer ? "/mypage" : "/"} className="shrink-0 hover:opacity-70 transition">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="トレカビンクス" className="h-12 w-auto" />
        </Link>
        {title && <h1 className="font-bold text-gray-900 whitespace-nowrap">{title}</h1>}
        <div className="flex-1" />
        {actions}
        {customer && (
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-sm text-gray-600">
              {customer.memberNo ? `${customer.memberNo}　` : ""}{name} 様
            </span>
            <Link
              href="/mypage/settings"
              aria-label="アカウント設定"
              title="アカウント設定"
              className="w-10 h-10 rounded-full border border-gray-300 bg-white flex items-center justify-center text-lg hover:border-brand-500 hover:bg-brand-50 transition"
            >
              👤
            </Link>
            <form action={logoutCustomer}>
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-700">
                ログアウト
              </button>
            </form>
          </div>
        )}
      </div>
    </header>
  );
}
