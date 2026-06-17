import { NextResponse } from "next/server";

export function middleware() {
  // 管理画面の保護は各ページ/レイアウト側（admin/layout.tsx）で実施。
  // middleware は Edge ランタイムのため Node の crypto を使う auth() は呼べない。

  // セキュリティヘッダー
  const response = NextResponse.next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
