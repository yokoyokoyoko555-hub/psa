import Link from "next/link";
import { getFooterLegalDocuments } from "@/actions/legal-document";

// 規程文書へのリンクは表示ON/OFFを管理画面から切り替えられるためDB駆動。それ以外は固定リンク。ADR-0058
const STATIC_LINKS = [{ href: "/contact", label: "お問い合わせ" }];

export default async function Footer() {
  const legalDocuments = await getFooterLegalDocuments();
  const links = [...legalDocuments.map((d) => ({ href: d.path, label: d.title })), ...STATIC_LINKS];

  return (
    <footer className="border-t border-gray-200 bg-gray-50 mt-auto">
      <div className="max-w-4xl mx-auto px-4 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-sm">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="トレカビンクス" className="h-6 w-auto" />
          <span className="text-xs text-gray-400">© {new Date().getFullYear()} K.K.TURUPURUN All rights reserved.</span>
        </div>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-gray-500 hover:text-brand-600 transition">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
