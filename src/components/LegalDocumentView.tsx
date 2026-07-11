import CustomerHeader from "@/components/CustomerHeader";
import Footer from "@/components/Footer";
import { renderLegalMarkdown } from "@/lib/legal-markdown";
import { format } from "date-fns";
import { ja } from "date-fns/locale";

type LegalDocument = {
  title: string;
  body: string;
  establishedAt: Date;
  revisedAt: Date[];
};

/** 規程文書（利用規約・個人情報保護方針・カスタマーハラスメントポリシー等）の共通表示。ADR-0057/0058 */
export default function LegalDocumentView({ document }: { document: LegalDocument | null }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <CustomerHeader title={document?.title ?? ""} />

      <main className="max-w-3xl mx-auto px-4 py-10">
        {document ? (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{document.title}</h1>
            <p className="text-xs text-gray-400 mb-6">
              制定日：{format(new Date(document.establishedAt), "yyyy年M月d日", { locale: ja })}
              {document.revisedAt.length > 0 && (
                <>
                  　／　改訂日：
                  {document.revisedAt
                    .map((d) => format(new Date(d), "yyyy年M月d日", { locale: ja }))
                    .join("、")}
                </>
              )}
            </p>

            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 text-sm text-gray-700 leading-relaxed">
              {renderLegalMarkdown(document.body)}
            </div>
          </>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">準備中です。</div>
        )}
      </main>

      <Footer />
    </div>
  );
}
