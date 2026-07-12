export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getAdminNavItems } from "@/actions/admin-nav";
import PsaProgressStatusForm from "./PsaProgressStatusForm";
import StoreSettingsForm from "./StoreSettingsForm";
import AdminNavOrderForm from "./AdminNavOrderForm";
import CenteringToggleForm from "./CenteringToggleForm";
import MailTemplateManager from "./MailTemplateManager";
import ChangePasswordForm from "./ChangePasswordForm";

const groupCls = "bg-white rounded-xl border border-gray-200 p-6";

export default async function GeneralSettingsPage() {
  const session = await auth();
  const user = session?.user as { name?: string; email?: string; role?: string } | undefined;

  const [psaProgressStatuses, storeSettings, navItems, mailTemplates] = await Promise.all([
    prisma.psaProgressStatus.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.storeSettings.findUnique({ where: { id: "default" } }),
    getAdminNavItems(),
    prisma.mailTemplate.findMany({ orderBy: { key: "asc" } }),
  ]);

  return (
    <div className="p-8 max-w-6xl space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">各種設定</h1>

      {/* PSA進捗ステータス（PSA提出グループの一括更新用） */}
      <details className={groupCls} open>
        <summary className="text-lg font-bold text-gray-900 cursor-pointer select-none">PSA進捗ステータス</summary>
        <div className="mt-4">
          <PsaProgressStatusForm statuses={psaProgressStatuses} />
        </div>
      </details>

      {/* 店舗情報（郵送先住所） */}
      <details className={groupCls}>
        <summary className="text-lg font-bold text-gray-900 cursor-pointer select-none">店舗情報（郵送先住所）</summary>
        <div className="mt-4">
          <StoreSettingsForm
            postalCode={storeSettings?.postalCode ?? ""}
            address={storeSettings?.address ?? ""}
            storeName={storeSettings?.storeName ?? ""}
            phone={storeSettings?.phone ?? ""}
          />
        </div>
      </details>

      {/* センタリング測定ツール（顧客画面への表示ON/OFF） */}
      <details className={groupCls}>
        <summary className="text-lg font-bold text-gray-900 cursor-pointer select-none">センタリング測定ツール</summary>
        <div className="mt-4">
          <CenteringToggleForm enabled={storeSettings?.centeringToolEnabled ?? true} />
        </div>
      </details>

      {/* 管理画面サイドバーの表示名・並び順 */}
      <details className={groupCls}>
        <summary className="text-lg font-bold text-gray-900 cursor-pointer select-none">サイドバー表示順</summary>
        <div className="mt-4">
          <AdminNavOrderForm items={navItems} />
        </div>
      </details>

      {/* メールテンプレート */}
      <details className={groupCls}>
        <summary className="text-lg font-bold text-gray-900 cursor-pointer select-none">メールテンプレート</summary>
        <div className="mt-4">
          <p className="text-sm text-gray-500 mb-4">
            申込受付・代理入力完了・グレード確定・返却完了などの自動送信メールの文面を編集します。
          </p>
          {mailTemplates.length === 0 ? (
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
              テンプレートがありません。`npm run db:seed` で初期テンプレートを投入してください。
            </div>
          ) : (
            <MailTemplateManager templates={mailTemplates} />
          )}
        </div>
      </details>

      {/* アカウント */}
      <details className={groupCls}>
        <summary className="text-lg font-bold text-gray-900 cursor-pointer select-none">アカウント</summary>
        <div className="mt-4 space-y-4">
          <div className={"border border-gray-100 rounded-lg p-4"}>
            <h3 className="font-bold text-gray-800 mb-3">ログイン情報</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">名前</dt>
                <dd className="text-gray-900">{user?.name ?? "-"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">メール</dt>
                <dd className="text-gray-900">{user?.email ?? "-"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">権限</dt>
                <dd className="text-gray-900">{user?.role ?? "-"}</dd>
              </div>
            </dl>
          </div>
          <div className={"border border-gray-100 rounded-lg p-4"}>
            <h3 className="font-bold text-gray-800 mb-3">パスワード変更</h3>
            <ChangePasswordForm />
          </div>
        </div>
      </details>
    </div>
  );
}
