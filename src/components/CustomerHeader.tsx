import Link from "next/link";
import type { ReactNode } from "react";
import { getCustomerSession } from "@/lib/customer-auth";

type Props = {
  title?: string;
  actions?: ReactNode;
};

export default async function CustomerHeader({ title, actions }: Props) {
  const customer = await getCustomerSession();

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-10 px-4 py-3">
      <div className="max-w-6xl mx-auto flex items-center gap-2 sm:gap-4">
        <Link href={customer ? "/mypage" : "/"} className="shrink-0 hover:opacity-70 transition">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="トレカビンクス" className="h-9 sm:h-12 w-auto" />
        </Link>
        {title ? (
          <h1 className="min-w-0 flex-1 truncate font-bold text-gray-900 text-sm sm:text-base">{title}</h1>
        ) : (
          <div className="flex-1" />
        )}
        {/* ロゴ・タイトルが狭い画面で縮む一方、操作系は常にフル表示のまま右端で確保する */}
        <div className="shrink-0 flex items-center gap-2 sm:gap-4">
          {actions}
          {customer && (
            <Link
              href="/mypage/settings"
              aria-label="アカウント設定"
              title="アカウント設定"
              className="w-10 h-10 rounded-full border border-gray-300 bg-white flex items-center justify-center text-lg hover:border-brand-500 hover:bg-brand-50 transition"
            >
              <svg className="h-5 w-5 text-brand-600" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.42 0-8 2.69-8 6v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1c0-3.31-3.58-6-8-6Z" />
              </svg>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
