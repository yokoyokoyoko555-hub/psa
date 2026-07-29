"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type NavItem = { href: string; label: string; icon: string };

export default function AdminShell({
  children,
  navItems,
  userName,
  role,
  logoutAction,
}: {
  children: React.ReactNode;
  navItems: NavItem[];
  userName?: string | null;
  role: string;
  logoutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // ページ遷移時にメニューを閉じる（useEffectではなくrender中にstateを調整する推奨パターン）
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  const navigation = (
    <>
      <div className="border-b border-gray-700 p-4">
        <p className="text-xs text-gray-400">トレカビンクス</p>
        <p className="font-bold">PSA管理システム</p>
      </div>
      <nav className="flex-1 overflow-y-auto py-3" aria-label="管理メニュー">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 border-l-2 px-4 py-2.5 text-sm transition ${
                active
                  ? "border-brand-300 bg-gray-800 text-white"
                  : "border-transparent text-gray-300 hover:bg-gray-800 hover:text-white"
              }`}
            >
              <span aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-gray-700 p-4">
        <p className="text-xs text-gray-300">{userName}</p>
        <p className="text-xs text-gray-500">{role}</p>
        <form action={logoutAction}>
          <button type="submit" className="mt-3 min-h-10 text-xs text-gray-400 hover:text-white">
            ログアウト
          </button>
        </form>
      </div>
    </>
  );

  const quickNav = [
    { href: "/admin/dashboard", label: "ホーム", icon: "⌂" },
    { href: "/admin/applications", label: "申込", icon: "▤" },
    { href: "/admin/inquiries", label: "問合せ", icon: "●" },
  ];

  return (
    <div className="min-h-screen bg-gray-100 lg:flex">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col bg-gray-900 text-white lg:flex">
        {navigation}
      </aside>

      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-gray-200 bg-white px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="管理メニューを開く"
          aria-expanded={open}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 text-xl text-gray-700"
        >
          ☰
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-gray-500">PSA管理システム</p>
          <p className="truncate text-sm font-bold text-gray-900">{navItems.find((item) => pathname.startsWith(item.href))?.label ?? "管理画面"}</p>
        </div>
        <Link
          href="/admin/applications"
          aria-label="申込を検索"
          className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-xl text-brand-700"
        >
          ⌕
        </Link>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="メニューを閉じる" className="absolute inset-0 bg-black/45" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[min(19rem,86vw)] flex-col bg-gray-900 text-white shadow-2xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="メニューを閉じる"
              className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-lg text-xl text-gray-300 hover:bg-gray-800"
            >
              ×
            </button>
            {navigation}
          </aside>
        </div>
      )}

      <main className="min-h-screen min-w-0 flex-1 pb-20 lg:ml-56 lg:pb-0">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-gray-200 bg-white pb-[max(.35rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-8px_24px_rgba(0,0,0,.08)] lg:hidden">
        {quickNav.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className={`flex min-h-12 flex-col items-center justify-center text-[10px] font-medium ${active ? "text-brand-700" : "text-gray-500"}`}>
              <span className="text-lg" aria-hidden="true">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
        <button type="button" onClick={() => setOpen(true)} className="flex min-h-12 flex-col items-center justify-center text-[10px] font-medium text-gray-500">
          <span className="text-lg" aria-hidden="true">☰</span>
          その他
        </button>
      </nav>
    </div>
  );
}
