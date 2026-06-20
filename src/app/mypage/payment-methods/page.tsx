import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function PaymentMethodsRedirectPage() {
  redirect("/mypage/settings#payment-methods");
}
