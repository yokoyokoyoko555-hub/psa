export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCustomerSession } from "@/lib/customer-auth";
import { getMyApplications } from "@/actions/application";
import ApplicationCenter, { type AppRow } from "./ApplicationCenter";

const SERVICE_LABELS: Record<string, string> = {
  VALUE: "バリュー",
  VALUE_BULK: "バリューバルク",
  VALUE_PLUS: "バリュープラス",
  VALUE_MAX: "バリューマックス",
  REGULAR: "レギュラー",
  EXPRESS: "エクスプレス",
  SUPER_EXPRESS: "スーパー・エクスプレス",
  WALK_THROUGH: "ウォーク・スルー",
  PREMIUM_1: "プレミアム 1",
  PREMIUM_2: "プレミアム 2",
  PREMIUM_3: "プレミアム 3",
  PREMIUM_5: "プレミアム 5",
  PREMIUM_10: "プレミアム 10",
};

export default async function ApplicationsPage() {
  const customer = await getCustomerSession();
  if (!customer) redirect("/login");

  const applications = await getMyApplications();

  const rows: AppRow[] = applications.map((app) => {
    const draftCards =
      app.status === "DRAFT" && app.draftData
        ? ((app.draftData as { cards?: unknown[] }).cards?.length ?? 0)
        : 0;
    return {
      id: app.id,
      applicationNo: app.applicationNo,
      cardCount: app.status === "DRAFT" ? draftCards : app.cards.length,
      serviceLevel: SERVICE_LABELS[app.serviceLevel] ?? app.serviceLevel,
      createdAt: new Date(app.createdAt).toISOString(),
      status: app.status,
      isDraft: app.status === "DRAFT",
    };
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <Link href="/mypage" className="shrink-0 hover:opacity-70 transition">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpg" alt="トレカビンクス" className="h-12 w-auto" />
          </Link>
          <h1 className="font-bold text-gray-900">申込一覧</h1>
          <div className="flex-1" />
          <Link
            href="/apply"
            className="shrink-0 bg-brand-600 text-white rounded-full px-4 py-1.5 text-sm font-bold hover:bg-brand-700 transition"
          >
            新規申込
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <ApplicationCenter apps={rows} />
      </main>
    </div>
  );
}
