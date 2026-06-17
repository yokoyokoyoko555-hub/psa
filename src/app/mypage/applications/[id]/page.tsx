export const dynamic = "force-dynamic";

import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCustomerSession } from "@/lib/customer-auth";
import { getApplicationDetail } from "@/actions/application";
import { format } from "date-fns";
import { ja } from "date-fns/locale";

const CARD_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "下書き", color: "bg-gray-100 text-gray-600" },
  SUBMITTED_BY_CUSTOMER: { label: "申込済", color: "bg-blue-100 text-blue-700" },
  RECEIVED_BY_STORE: { label: "店舗受取済", color: "bg-blue-100 text-blue-700" },
  INSPECTION_PENDING: { label: "検品待ち", color: "bg-yellow-100 text-yellow-700" },
  INSPECTED: { label: "検品済", color: "bg-yellow-100 text-yellow-700" },
  READY_FOR_PSA: { label: "PSA提出準備中", color: "bg-orange-100 text-orange-700" },
  SUBMITTED_TO_PSA: { label: "PSA提出済", color: "bg-purple-100 text-purple-700" },
  PSA_RECEIVED: { label: "PSA受付済", color: "bg-purple-100 text-purple-700" },
  GRADING: { label: "鑑定中", color: "bg-purple-100 text-purple-700" },
  GRADE_AVAILABLE: { label: "グレード確定", color: "bg-green-100 text-green-700" },
  RETURNED_TO_STORE: { label: "店舗返却済", color: "bg-green-100 text-green-700" },
  READY_FOR_CUSTOMER_RETURN: { label: "返却準備中", color: "bg-teal-100 text-teal-700" },
  RETURNED_TO_CUSTOMER: { label: "返却完了", color: "bg-green-100 text-green-700" },
  UPCHARGE_UNPAID: { label: "Upcharge未払い", color: "bg-red-100 text-red-700" },
  UPCHARGE_PAID: { label: "Upcharge支払済", color: "bg-green-100 text-green-700" },
  PROBLEM: { label: "問題発生", color: "bg-red-100 text-red-700" },
  CANCELLED: { label: "キャンセル", color: "bg-gray-100 text-gray-600" },
};

const SERVICE_LABELS: Record<string, string> = {
  VALUE: "Value",
  REGULAR: "Regular",
  EXPRESS: "Express",
  SUPER_EXPRESS: "Super Express",
};

export default async function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await getCustomerSession();
  if (!customer) redirect("/login");

  const application = await getApplicationDetail(id);
  if (!application) notFound();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <Link href="/mypage/applications" className="text-gray-500 hover:text-gray-700">← 申込一覧</Link>
          <h1 className="font-bold text-gray-900">{application.applicationNo}</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-bold text-gray-900 mb-4">申込概要</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500">サービス</p>
              <p className="font-medium">{SERVICE_LABELS[application.serviceLevel]}</p>
            </div>
            <div>
              <p className="text-gray-500">返却方法</p>
              <p className="font-medium">{application.returnMethod === "STORE_PICKUP" ? "店頭受取" : "配送"}</p>
            </div>
            <div>
              <p className="text-gray-500">申込日</p>
              <p className="font-medium">{format(new Date(application.createdAt), "yyyy/MM/dd", { locale: ja })}</p>
            </div>
            <div>
              <p className="text-gray-500">合計金額</p>
              <p className="font-bold text-lg">¥{application.totalAmount.toLocaleString()}</p>
            </div>
          </div>

          {/* Fee breakdown */}
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-1 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>PSA鑑定料</span><span>¥{application.psaFeeTotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>代行手数料</span><span>¥{application.agencyFeeTotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>送料</span><span>¥{application.shippingFee.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>保険料</span><span>¥{application.insuranceFee.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>消費税</span><span>¥{application.taxAmount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between font-bold border-t border-gray-200 pt-1 mt-1">
              <span>合計</span><span>¥{application.totalAmount.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Cards */}
        <div>
          <h2 className="font-bold text-gray-900 mb-4">カード一覧（{application.cards.length}枚）</h2>
          <div className="space-y-3">
            {application.cards.map((card) => {
              const statusInfo = CARD_STATUS_LABELS[card.status] ?? { label: card.status, color: "bg-gray-100 text-gray-600" };
              return (
                <div key={card.id} className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-mono text-xs text-gray-400">{card.cardNo}</p>
                      <p className="font-bold text-gray-900">{card.cardName}</p>
                      <p className="text-sm text-gray-500">{card.tcgTitle}</p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                  </div>

                  {card.psaGrade && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-3">
                      <p className="text-sm font-bold text-yellow-800">
                        PSA Grade: {card.psaGrade}
                        {card.psaCertNo && <span className="ml-3 font-normal text-yellow-600">Cert# {card.psaCertNo}</span>}
                      </p>
                    </div>
                  )}

                  {/* Status history */}
                  <div className="mt-3">
                    <details className="text-xs text-gray-500">
                      <summary className="cursor-pointer hover:text-gray-700">ステータス履歴</summary>
                      <div className="mt-2 space-y-1 pl-2 border-l-2 border-gray-100">
                        {card.statusHistory.map((h) => (
                          <div key={h.id} className="flex justify-between">
                            <span>{CARD_STATUS_LABELS[h.status]?.label ?? h.status}</span>
                            <span>{format(new Date(h.changedAt), "MM/dd HH:mm")}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
