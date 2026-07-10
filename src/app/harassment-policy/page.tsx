export const dynamic = "force-dynamic";

import { getLegalDocument } from "@/actions/legal-document";
import LegalDocumentView from "@/components/LegalDocumentView";

export const metadata = { title: "カスタマーハラスメントポリシー | トレカビンクス" };

export default async function HarassmentPolicyPage() {
  const document = await getLegalDocument("harassment_policy");
  return <LegalDocumentView document={document} />;
}
