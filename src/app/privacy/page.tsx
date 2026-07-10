export const dynamic = "force-dynamic";

import { getLegalDocument } from "@/actions/legal-document";
import LegalDocumentView from "@/components/LegalDocumentView";

export const metadata = { title: "個人情報保護方針 | トレカビンクス" };

export default async function PrivacyPage() {
  const document = await getLegalDocument("privacy");
  return <LegalDocumentView document={document} />;
}
