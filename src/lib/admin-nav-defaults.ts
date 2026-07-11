// 管理画面サイドバーの既定値。hrefとiconはここで固定し、管理画面からはlabel・sortOrderのみ編集する。ADR-0059
export const ADMIN_NAV_DEFAULTS = [
  { id: "dashboard", href: "/admin/dashboard", icon: "📊", label: "ダッシュボード", sortOrder: 0 },
  { id: "applications", href: "/admin/applications", icon: "📋", label: "申込管理", sortOrder: 1 },
  { id: "store-requests", href: "/admin/store-requests", icon: "🏪", label: "代理申込", sortOrder: 2 },
  { id: "customers", href: "/admin/customers", icon: "👥", label: "顧客管理", sortOrder: 3 },
  { id: "notifications", href: "/admin/notifications", icon: "📣", label: "お知らせ", sortOrder: 4 },
  { id: "inquiries", href: "/admin/inquiries", icon: "💬", label: "お問い合わせ", sortOrder: 5 },
  { id: "submission-bookings", href: "/admin/submission-bookings", icon: "📅", label: "提出予約", sortOrder: 6 },
  { id: "psa-groups", href: "/admin/psa-groups", icon: "📦", label: "PSA提出グループ", sortOrder: 7 },
  { id: "card-masters", href: "/admin/card-masters", icon: "🗂️", label: "カード名称マスタ", sortOrder: 8 },
  { id: "mail-templates", href: "/admin/mail-templates", icon: "✉️", label: "メールテンプレート", sortOrder: 9 },
  { id: "legal-documents", href: "/admin/legal-documents", icon: "📜", label: "規程管理", sortOrder: 10 },
  { id: "settings", href: "/admin/settings", icon: "⚙️", label: "料金設定", sortOrder: 11 },
  { id: "account", href: "/admin/account", icon: "🔑", label: "アカウント", sortOrder: 12 },
] as const;
