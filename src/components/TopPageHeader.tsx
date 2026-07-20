import Link from "next/link";

// 未ログイン時のトップページ専用ヘッダー。ログイン中はCustomerHeaderを使う（こちらはログイン/新規登録導線のみ）。
export default function TopPageHeader() {
  return (
    <header className="bg-white border-b border-gray-200 px-4 py-3">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
        <Link href="/" className="shrink-0 hover:opacity-70 transition">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="トレカビンクス" className="h-9 sm:h-12 w-auto" />
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/login"
            className="whitespace-nowrap rounded-full border border-gray-300 px-3 sm:px-4 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50 transition"
          >
            ログイン
          </Link>
          <Link
            href="/signup"
            className="whitespace-nowrap rounded-full bg-brand-600 px-3 sm:px-4 py-1.5 text-sm font-bold text-white hover:bg-brand-700 transition"
          >
            新規登録
          </Link>
        </div>
      </div>
    </header>
  );
}
