"use client";

import { useRouter } from "next/navigation";

/** テーブル行全体をクリック可能にする（サーバーコンポーネントの子要素をそのまま渡せる）。 */
export default function ClickableRow({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <tr
      onClick={() => router.push(href)}
      className={`cursor-pointer ${className ?? ""}`}
    >
      {children}
    </tr>
  );
}
