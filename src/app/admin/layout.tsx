export const dynamic = "force-dynamic";

import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get("x-pathname") ?? "";

  // ログインページは保護対象外（サイドバーなしで素のまま表示。リダイレクトループ防止）
  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  const session = await auth();

  if (!session?.user) {
    redirect("/admin/login");
  }

  const navItems = [
    { href: "/admin/dashboard", label: "ダッシュボード", icon: "📊" },
    { href: "/admin/applications", label: "申込管理", icon: "📋" },
    { href: "/admin/store-requests", label: "代理申込", icon: "🏪" },
    { href: "/admin/cards", label: "カード管理", icon: "🃏" },
    { href: "/admin/customers", label: "顧客管理", icon: "👥" },
    { href: "/admin/psa-groups", label: "PSA提出グループ", icon: "📦" },
    { href: "/admin/settings", label: "設定", icon: "⚙️" },
    { href: "/admin/account", label: "アカウント", icon: "🔑" },
  ];

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Sidebar */}
      <div className="w-56 bg-gray-900 text-white flex flex-col fixed h-full z-10">
        <div className="p-4 border-b border-gray-700">
          <p className="text-xs text-gray-400">トレカビンクス</p>
          <p className="font-bold">PSA管理システム</p>
        </div>

        <nav className="flex-1 py-4">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition"
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-700">
          <p className="text-xs text-gray-400 mb-1">{session.user.name}</p>
          <p className="text-xs text-gray-500">{(session.user as { role: string }).role}</p>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/admin/login" });
            }}
          >
            <button type="submit" className="text-xs text-gray-400 hover:text-white mt-2">
              ログアウト
            </button>
          </form>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 ml-56 min-h-screen">{children}</div>
    </div>
  );
}
