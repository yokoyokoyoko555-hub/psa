export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCustomerProfile } from "@/actions/customer";
import ProfileEditForm from "./ProfileEditForm";

export default async function ProfilePage() {
  const profile = await getCustomerProfile();
  if (!profile) redirect("/login");

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <Link href="/mypage" className="text-sm text-brand-600 hover:underline">
          ← マイページ
        </Link>
        <h1 className="text-xl font-bold text-gray-900">登録情報の編集</h1>
        <ProfileEditForm profile={profile} />
      </main>
    </div>
  );
}
