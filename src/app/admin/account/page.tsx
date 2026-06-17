export const dynamic = "force-dynamic";

import { auth } from "@/lib/auth";
import ChangePasswordForm from "./ChangePasswordForm";

export default async function AdminAccountPage() {
  const session = await auth();
  const user = session?.user as { name?: string; email?: string; role?: string } | undefined;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-gray-900">アカウント</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-bold text-gray-900 mb-4">ログイン情報</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">名前</dt>
            <dd className="text-gray-900">{user?.name ?? "-"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">メール</dt>
            <dd className="text-gray-900">{user?.email ?? "-"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">権限</dt>
            <dd className="text-gray-900">{user?.role ?? "-"}</dd>
          </div>
        </dl>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-bold text-gray-900 mb-4">パスワード変更</h2>
        <ChangePasswordForm />
      </div>
    </div>
  );
}
