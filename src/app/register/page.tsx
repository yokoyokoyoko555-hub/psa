export const dynamic = "force-dynamic";

import Link from "next/link";
import { verifyRegistrationToken } from "@/actions/customer";
import AuthScreen from "@/components/AuthScreen";
import CustomerHeader from "@/components/CustomerHeader";
import Footer from "@/components/Footer";
import RegisterForm from "./RegisterForm";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  // トークンなし → 新規登録/ログインの認証画面
  if (!token) {
    return <AuthScreen initialTab="signup" footer={<Footer />} />;
  }

  // トークンあり → 検証して登録フォーム
  const result = await verifyRegistrationToken(token);
  if (!result.valid || !result.email) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <CustomerHeader title="会員登録" />
        <div className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md text-center space-y-4">
            <h1 className="text-xl font-bold text-gray-900">リンクが無効です</h1>
            <p className="text-sm text-gray-600">
              認証リンクの有効期限が切れているか、すでに使用されています。お手数ですが最初からやり直してください。
            </p>
            <Link
              href="/register"
              className="inline-block bg-brand-600 text-white font-bold px-6 py-3 rounded-lg hover:bg-brand-700 transition"
            >
              新規登録をやり直す
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return <RegisterForm email={result.email} token={token} />;
}
