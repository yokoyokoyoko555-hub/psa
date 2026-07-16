export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCustomerSession } from "@/lib/customer-auth";
import { getMyApplications } from "@/actions/application";
import CustomerHeader from "@/components/CustomerHeader";
import Footer from "@/components/Footer";
import ApplicationCenter, { type AppRow } from "./ApplicationCenter";
import { REGION_LABELS, ITEM_TYPE_LABELS, resolveServiceLevel, computeListDisplayStatus } from "@/lib/application-status";

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
      serviceLevel: resolveServiceLevel(app),
      region: REGION_LABELS[app.region] ?? app.region,
      itemType: app.region === "PSA_US" ? (ITEM_TYPE_LABELS[app.itemType] ?? app.itemType) : null,
      createdAt: new Date(app.createdAt).toISOString(),
      status: app.status,
      displayStatus:
        app.status === "DRAFT"
          ? null
          : (() => {
              const raw = computeListDisplayStatus(app);
              return raw === "MULTIPLE" ? "複数グループ" : raw;
            })(),
      source: app.source,
      isDraft: app.status === "DRAFT",
    };
  });

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
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

      <main className="flex-1 max-w-4xl mx-auto px-4 py-8">
        <ApplicationCenter apps={rows} />
      </main>
      <Footer />
    </div>
  );
}
