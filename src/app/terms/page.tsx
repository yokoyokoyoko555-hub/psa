export const dynamic = "force-dynamic";

import { getLegalDocument } from "@/actions/legal-document";
import LegalDocumentView from "@/components/LegalDocumentView";

export const metadata = { title: "利用規約 | トレカビンクス" };

export default async function TermsPage() {
  const document = await getLegalDocument("terms");
  return <LegalDocumentView document={document} />;
}
