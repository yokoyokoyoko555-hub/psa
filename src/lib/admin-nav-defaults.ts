// 管理画面サイドバーの既定値。hrefとiconはここで固定し、管理画面からはlabel・sortOrderのみ編集する。ADR-0059
// section: 管理画面のタブ分割（鑑定受付=PSA / 販売=EBAY）。href/icon同様コード固定でDB編集対象外。ADR-0079
export const ADMIN_NAV_DEFAULTS = [
  { id: "dashboard", href: "/admin/dashboard", icon: "📊", label: "ダッシュボード", sortOrder: 0, section: "PSA" },
  { id: "applications", href: "/admin/applications", icon: "📋", label: "申込管理", sortOrder: 1, section: "PSA" },
  { id: "store-requests", href: "/admin/store-requests", icon: "🏪", label: "代理申込", sortOrder: 2, section: "PSA" },
  { id: "customers", href: "/admin/customers", icon: "👥", label: "顧客管理", sortOrder: 3, section: "PSA" },
  { id: "notifications", href: "/admin/notifications", icon: "📣", label: "お知らせ", sortOrder: 4, section: "PSA" },
  { id: "inquiries", href: "/admin/inquiries", icon: "💬", label: "お問い合わせ", sortOrder: 5, section: "PSA" },
  { id: "submission-bookings", href: "/admin/submission-bookings", icon: "📅", label: "提出予約", sortOrder: 6, section: "PSA" },
  { id: "psa-groups", href: "/admin/psa-groups", icon: "📦", label: "PSA提出グループ", sortOrder: 7, section: "PSA" },
  { id: "card-masters", href: "/admin/card-masters", icon: "🗂️", label: "カード名称マスタ", sortOrder: 8, section: "PSA" },
  { id: "legal-documents", href: "/admin/legal-documents", icon: "📜", label: "規程管理", sortOrder: 9, section: "PSA" },
  { id: "settings", href: "/admin/price-setting", icon: "⚙️", label: "料金設定", sortOrder: 10, section: "PSA" },
  { id: "general-settings", href: "/admin/general-settings", icon: "🔧", label: "各種設定", sortOrder: 11, section: "PSA" },
  // メールテンプレート・アカウントは「各種設定」内のセクションへ統合したため、サイドバー項目としては廃止。ADR-0070
  // 販売（eBay委託販売）タブ。Phase 2以降、画面を追加するごとにここへ section: "EBAY" で追記していく。ADR-0079
  { id: "ebay", href: "/admin/ebay", icon: "🌏", label: "販売ダッシュボード", sortOrder: 0, section: "EBAY" },
  { id: "ebay-agreements", href: "/admin/ebay/agreements", icon: "📝", label: "買取契約", sortOrder: 1, section: "EBAY" },
  { id: "ebay-identity", href: "/admin/ebay/identity-verifications", icon: "🪪", label: "本人確認審査", sortOrder: 2, section: "EBAY" },
  { id: "ebay-settings", href: "/admin/ebay/settings", icon: "💱", label: "販売設定", sortOrder: 3, section: "EBAY" },
] as const;

export type AdminNavSection = "PSA" | "EBAY";
