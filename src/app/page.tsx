export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCustomerSession } from "@/lib/customer-auth";
import AuthScreen from "@/components/AuthScreen";

export default async function Home() {
  // ログイン済みならマイページへ
  const customer = await getCustomerSession();
  if (customer) redirect("/mypage");

  return <AuthScreen initialTab="signup" />;
}
