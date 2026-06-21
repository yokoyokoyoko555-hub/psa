export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCustomerSession } from "@/lib/customer-auth";
import { getMyApplications } from "@/actions/application";
import CustomerHeader from "@/components/CustomerHeader";
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
      <CustomerHeader
        title="申込一覧"
        actions={
          <Link
            href="/apply"
            className="shrink-0 bg-brand-600 text-white rounded-full px-4 py-1.5 text-sm font-bold hover:bg-brand-700 transition"
          >
            新規申込
          </Link>
        }
      />

      <main className="max-w-4xl mx-auto px-4 py-8">
        <ApplicationCenter apps={rows} />
      </main>
    </div>
  );
}
