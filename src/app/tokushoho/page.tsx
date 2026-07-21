export const dynamic = "force-dynamic";

import { getLegalDocument } from "@/actions/legal-document";
import LegalDocumentView from "@/components/LegalDocumentView";

export const metadata = { title: "特定商取引法に基づく表記 | トレカビンクス" };

export default async function TokushohoPage() {
  const document = await getLegalDocument("tokushoho");
  return <LegalDocumentView document={document} />;
}
