import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function ProfileRedirectPage() {
  redirect("/mypage/settings#profile");
}
