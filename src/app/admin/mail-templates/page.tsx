export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import MailTemplateManager from "./MailTemplateManager";

export const metadata = { title: "メールテンプレート | 管理" };

export default async function MailTemplatesPage() {
  const templates = await prisma.mailTemplate.findMany({ orderBy: { key: "asc" } });

  return (
    <div className="p-8 max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">メールテンプレート</h1>
        <p className="text-sm text-gray-500 mt-1">申込受付・代理入力完了・グレード確定・返却完了などの自動送信メールの文面を編集します。</p>
      </div>
      {templates.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
          テンプレートがありません。`npm run db:seed` で初期テンプレートを投入してください。
        </div>
      ) : (
        <MailTemplateManager templates={templates} />
      )}
    </div>
  );
}
