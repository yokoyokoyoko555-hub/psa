export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getLegalDocument } from "@/actions/legal-document";
import LegalDocumentView from "@/components/LegalDocumentView";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const document = await getLegalDocument(id);
  return { title: document ? `${document.title} | トレカビンクス` : "規程 | トレカビンクス" };
}

// terms/privacy/harassment-policyは専用ページを持つため、それ以外（管理画面から新規作成した文書）を表示する。ADR-0058
export default async function LegalDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const document = await getLegalDocument(id);
  if (!document) notFound();

  return <LegalDocumentView document={document} />;
}
