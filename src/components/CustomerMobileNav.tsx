"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/mypage", label: "ホーム", icon: "⌂" },
  { href: "/mypage/applications", label: "申込一覧", icon: "▤" },
  { href: "/apply", label: "新規申込", icon: "+", primary: true },
  { href: "/mypage/notifications", label: "お知らせ", icon: "●" },
  { href: "/mypage/settings", label: "メニュー", icon: "☰" },
];

export default function CustomerMobileNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="マイページメニュー"
      className="customer-mobile-nav fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_rgba(0,0,0,.08)] backdrop-blur md:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-5">
        {items.map((item) => {
          const active = item.href === "/mypage" ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-medium transition ${
                item.primary
                  ? "-mt-5 text-brand-700"
                  : active
                    ? "bg-brand-50 text-brand-700"
                    : "text-gray-500 hover:bg-gray-50 hover:text-brand-700"
              }`}
            >
              <span
                className={`flex items-center justify-center text-lg ${
                  item.primary ? "h-12 w-12 rounded-full bg-brand-600 text-2xl text-white shadow-lg" : "h-6"
                }`}
                aria-hidden="true"
              >
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
