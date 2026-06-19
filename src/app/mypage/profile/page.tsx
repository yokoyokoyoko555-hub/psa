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
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <Link href="/mypage" className="text-gray-500 hover:text-gray-700">← マイページ</Link>
          <h1 className="font-bold text-gray-900">登録情報の編集</h1>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <ProfileEditForm profile={profile} />
      </main>
    </div>
  );
}
