import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AddressesRedirectPage() {
  redirect("/mypage/settings#addresses");
}
