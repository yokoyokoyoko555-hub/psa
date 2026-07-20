export const dynamic = "force-dynamic";

import AuthScreen from "@/components/AuthScreen";
import Footer from "@/components/Footer";

export default function SignupPage() {
  return <AuthScreen initialTab="signup" withHeader={false} footer={<Footer />} />;
}
