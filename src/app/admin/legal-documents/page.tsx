export const dynamic = "force-dynamic";

import { getLegalDocuments } from "@/actions/legal-document";
import LegalDocumentForm from "./LegalDocumentForm";
import { format } from "date-fns";

export default async function LegalDocumentsPage() {
  const documents = await getLegalDocuments();

  return (
    <div className="p-8 max-w-4xl space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">規程管理</h1>
      <p className="text-sm text-gray-500">
        利用規約・個人情報保護方針・カスタマーハラスメントポリシーの本文と制定日・改訂日を編集できます。
      </p>

      {documents.map((doc) => (
        <details key={doc.id} className="bg-white rounded-xl border border-gray-200 p-6">
          <summary className="text-lg font-bold text-gray-900 cursor-pointer select-none flex items-center justify-between">
            <span>{doc.title}</span>
            <span className="text-xs font-normal text-gray-400">
              制定日 {format(new Date(doc.establishedAt), "yyyy/MM/dd")}
              {doc.revisedAt && ` ／ 改訂日 ${format(new Date(doc.revisedAt), "yyyy/MM/dd")}`}
            </span>
          </summary>
          <div className="mt-4">
            <LegalDocumentForm
              id={doc.id}
              initialTitle={doc.title}
              initialBody={doc.body}
              initialEstablishedAt={doc.establishedAt}
              initialRevisedAt={doc.revisedAt}
            />
          </div>
        </details>
      ))}
    </div>
  );
}
