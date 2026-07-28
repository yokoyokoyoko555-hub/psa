export const dynamic = "force-dynamic";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import { getAdminNavItems } from "@/actions/admin-nav";
import AdminShell from "@/components/AdminShell";

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

  const navItems = await getAdminNavItems();

  async function logoutAction() {
    "use server";
    await signOut({ redirectTo: "/admin/login" });
  }

  return (
    <AdminShell
      navItems={navItems}
      userName={session.user.name}
      role={(session.user as { role: string }).role}
      logoutAction={logoutAction}
    >
      {children}
    </AdminShell>
  );
}
