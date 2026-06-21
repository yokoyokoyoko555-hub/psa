export const dynamic = "force-dynamic";

import Link from "next/link";
import { verifyPasswordResetToken } from "@/actions/customer";
import ResetPasswordForm from "./ResetPasswordForm";

export const metadata = { title: "パスワード再設定 | トレカビンクス" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const result = token ? await verifyPasswordResetToken(token) : { valid: false };

  return (
    <div className="min-h-[100dvh] bg-white flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="inline-block mb-8 hover:opacity-70 transition">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="トレカビンクス" className="h-12 w-auto" />
        </Link>

        <h1 className="text-lg font-bold text-gray-900 mb-1">パスワードの再設定</h1>

        {result.valid && token ? (
          <>
            <p className="text-sm text-gray-500 mb-6">新しいパスワードを設定してください。</p>
            <ResetPasswordForm token={token} />
          </>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">
              リンクが無効か期限切れです（有効期限は1時間です）。お手数ですが、もう一度お試しください。
            </div>
            <Link
              href="/login"
              className="block text-center w-full bg-brand-600 text-white font-bold py-3 rounded-lg hover:bg-brand-700"
            >
              ログインへ戻る
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
