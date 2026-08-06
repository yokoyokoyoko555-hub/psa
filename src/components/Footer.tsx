import Link from "next/link";
import { getFooterLegalDocuments } from "@/actions/legal-document";

// 規程文書へのリンクは表示ON/OFFを管理画面から切り替えられるためDB駆動。それ以外は固定リンク。ADR-0058
const STATIC_LINKS = [{ href: "/contact", label: "お問い合わせ" }];

export default async function Footer() {
  const legalDocuments = await getFooterLegalDocuments();
  const links = [...legalDocuments.map((d) => ({ href: d.path, label: d.title })), ...STATIC_LINKS];

  return (
    <footer className="border-t border-gray-200 bg-gray-50 mt-auto">
      {/* スマホは下部固定ナビと競合しないよう、規程リンクを折りたたむ。 */}
      <div className="mx-auto max-w-6xl px-4 py-4 sm:hidden">
        <p className="text-center text-[11px] text-gray-400">
          © {new Date().getFullYear()} K.K.TURUPURUN All rights reserved.
        </p>
        <details className="group mt-3 border-t border-gray-200 pt-1">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 text-sm font-medium text-gray-600 [&::-webkit-details-marker]:hidden">
            規約・お問い合わせ
            <span aria-hidden="true" className="text-xs transition-transform group-open:rotate-180">▼</span>
          </summary>
          <nav aria-label="規約・お問い合わせ" className="grid grid-cols-1 gap-1 pb-2">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="flex min-h-11 items-center justify-between rounded-lg px-3 text-sm text-gray-600 hover:bg-white hover:text-brand-600"
              >
                {l.label}
                <span aria-hidden="true" className="text-gray-300">›</span>
              </Link>
            ))}
          </nav>
        </details>
      </div>

      <div className="mx-auto hidden max-w-6xl items-center justify-between gap-4 px-4 py-5 text-sm sm:flex">
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
