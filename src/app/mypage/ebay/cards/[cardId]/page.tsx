export const dynamic = "force-dynamic";

import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCustomerSession } from "@/lib/customer-auth";
import { prisma } from "@/lib/prisma";
import { getPurchaseEligibility } from "@/actions/purchase";
import { formatMoneyInt } from "@/lib/currency";
import CustomerHeader from "@/components/CustomerHeader";
import Footer from "@/components/Footer";
import PurchaseRequestForm from "./PurchaseRequestForm";
import PurchaseAgreementPanel from "./PurchaseAgreementPanel";

/** eBay買取（カード単位）詳細ページ。申請前・審査中・同意待ち・成立後を1画面で扱う。ADR-0087 */
export default async function EbayCardDetailPage({ params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await params;
  const customer = await getCustomerSession();
  if (!customer) redirect("/login");

  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: { application: { select: { region: true } } },
  });
  if (!card || card.customerId !== customer.id) notFound();

  const [durationOptions, latestAgreement, eligibility] = await Promise.all([
    prisma.listingDurationOption.findMany({ where: { platform: "EBAY", isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.purchaseAgreement.findFirst({
      where: { cardId },
      orderBy: { createdAt: "desc" },
      include: { listingDurationOption: true },
    }),
    getPurchaseEligibility(cardId),
  ]);

  // 有効な契約（キャンセル・期限切れ以外）だけを「進行中」として扱う
  const activeAgreement =
    latestAgreement && !["CANCELLED", "EXPIRED"].includes(latestAgreement.status) ? latestAgreement : null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <CustomerHeader
        title="eBay買取"
        actions={
          <Link href={`/mypage/applications/${card.applicationId}`} className="text-sm text-gray-500 hover:text-gray-700">
            申込詳細へ戻る
          </Link>
        }
      />
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="font-mono text-xs text-gray-400">{card.cardNo}</p>
          <h1 className="font-bold text-lg text-gray-900">{card.cardName}</h1>
          <p className="text-sm text-gray-500">{card.tcgTitle}</p>
          {card.psaGrade && (
            <p className="text-sm text-gray-700 mt-2">
              PSA Grade: <span className="font-bold">{card.psaGrade}</span>
              {card.psaCertNo && <span className="ml-3 text-gray-500">Cert# {card.psaCertNo}</span>}
            </p>
          )}
          <p className="text-sm text-gray-500 mt-1">申告額: {formatMoneyInt(card.declaredValue, card.application.region)}</p>
        </div>

        {activeAgreement ? (
          <PurchaseAgreementPanel agreement={activeAgreement} />
        ) : eligibility.eligible ? (
          <PurchaseRequestForm cardId={card.id} durationOptions={durationOptions} />
        ) : (
          <div className="bg-white rounded-xl border border-amber-200 p-6">
            <h2 className="font-bold text-gray-900 mb-2">現在このカードは出品申請できません</h2>
            <ul className="list-disc list-inside text-sm text-amber-700 space-y-1">
              {eligibility.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            {eligibility.reasons.some((r) => r.includes("本人確認")) && (
              <Link
                href="/mypage/verify-identity"
                className="inline-block mt-3 text-sm font-bold text-brand-600 hover:underline"
              >
                本人確認へ進む →
              </Link>
            )}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
