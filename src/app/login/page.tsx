export const dynamic = "force-dynamic";

import AuthScreen from "@/components/AuthScreen";
import Footer from "@/components/Footer";

export default function LoginPage() {
  return <AuthScreen initialTab="login" withHeader={false} footer={<Footer />} />;
}
