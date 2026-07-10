import Link from "next/link";

const LINKS = [
  { href: "/terms", label: "利用規約" },
  { href: "/privacy", label: "個人情報保護方針" },
];

export default function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-gray-50 mt-auto">
      <div className="max-w-6xl mx-auto px-4 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-sm">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="トレカビンクス" className="h-6 w-auto" />
          <span className="text-xs text-gray-400">© {new Date().getFullYear()} 株式会社ツルプルン</span>
        </div>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-gray-500 hover:text-brand-600 transition">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
