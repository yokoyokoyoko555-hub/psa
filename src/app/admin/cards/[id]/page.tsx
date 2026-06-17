import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import CardStatusForm from "./CardStatusForm";
import GradeForm from "./GradeForm";
import UpchargeForm from "./UpchargeForm";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "下書き",
  SUBMITTED_BY_CUSTOMER: "申込済",
  RECEIVED_BY_STORE: "店舗受取済",
  INSPECTION_PENDING: "検品待ち",
  INSPECTED: "検品済",
  READY_FOR_PSA: "PSA提出準備中",
  SUBMITTED_TO_PSA: "PSA提出済",
  PSA_RECEIVED: "PSA受付済",
  GRADING: "鑑定中",
  GRADE_AVAILABLE: "グレード確定",
  RETURNED_TO_STORE: "店舗返却済",
  READY_FOR_CUSTOMER_RETURN: "返却準備中",
  RETURNED_TO_CUSTOMER: "返却完了",
  UPCHARGE_UNPAID: "Upcharge未払い",
  UPCHARGE_PAID: "Upcharge支払済",
  PROBLEM: "問題発生",
  CANCELLED: "キャンセル",
};

export default async function CardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const card = await prisma.card.findUnique({
    where: { id },
    include: {
      customer: true,
      application: true,
      statusHistory: { orderBy: { changedAt: "desc" } },
      upcharges: { orderBy: { createdAt: "desc" } },
      psaSubmissionGroup: true,
    },
  });

  if (!card) notFound();

  const customerName = decrypt(card.customer.nameEncrypted);

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin/cards" className="text-gray-500 hover:text-gray-700">← カード一覧</Link>
        <h1 className="text-xl font-bold text-gray-900">{card.cardName}</h1>
        <span className="font-mono text-sm text-gray-400">{card.cardNo}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card info */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-bold text-gray-900 mb-4">カード情報</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-gray-500">TCGタイトル</dt><dd className="font-medium">{card.tcgTitle}</dd></div>
              <div><dt className="text-gray-500">カード名</dt><dd className="font-medium">{card.cardName}</dd></div>
              <div><dt className="text-gray-500">型番</dt><dd className="font-medium">{card.cardNumber ?? "—"}</dd></div>
              <div><dt className="text-gray-500">レアリティ</dt><dd className="font-medium">{card.rarity ?? "—"}</dd></div>
              <div><dt className="text-gray-500">言語</dt><dd className="font-medium">{card.language}</dd></div>
              <div><dt className="text-gray-500">申告価格</dt><dd className="font-medium">¥{card.declaredValue.toLocaleString()}</dd></div>
              <div><dt className="text-gray-500">枚数</dt><dd className="font-medium">{card.quantity}枚</dd></div>
              <div><dt className="text-gray-500">申込番号</dt><dd className="font-medium">{card.application.applicationNo}</dd></div>
            </dl>
          </div>

          {/* PSA info */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-bold text-gray-900 mb-4">PSA情報</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm mb-4">
              <div><dt className="text-gray-500">提出グループ</dt><dd className="font-medium">{card.psaSubmissionGroup?.groupNo ?? "未割当"}</dd></div>
              <div><dt className="text-gray-500">PSA Submission ID</dt><dd className="font-mono">{card.psaSubmissionId ?? "—"}</dd></div>
              <div><dt className="text-gray-500">PSA Order ID</dt><dd className="font-mono">{card.psaOrderId ?? "—"}</dd></div>
              <div><dt className="text-gray-500">PSA Cert No</dt><dd className="font-mono font-bold">{card.psaCertNo ?? "—"}</dd></div>
              <div><dt className="text-gray-500">PSA Grade</dt><dd className="font-bold text-green-700 text-lg">{card.psaGrade ?? "—"}</dd></div>
              <div><dt className="text-gray-500">グレード確定日</dt><dd>{card.psaGradedAt ? format(new Date(card.psaGradedAt), "yyyy/MM/dd") : "—"}</dd></div>
            </dl>

            <GradeForm cardId={card.id} currentCertNo={card.psaCertNo} currentGrade={card.psaGrade} />
          </div>

          {/* Upcharges */}
          {card.upcharges.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-bold text-gray-900 mb-4">Upcharge履歴</h2>
              {card.upcharges.map((u) => (
                <div key={u.id} className="border border-gray-100 rounded-lg p-4 mb-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-gray-900">¥{u.upchargeAmount.toLocaleString()}</p>
                      <p className="text-sm text-gray-600">{u.reason}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        PSA申告額: ¥{u.psaDeclaredValue.toLocaleString()} → 最終評価額: ¥{u.psaFinalValue.toLocaleString()}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      u.status === "PAID" ? "bg-green-100 text-green-700" :
                      u.status === "FAILED" ? "bg-red-100 text-red-700" :
                      "bg-yellow-100 text-yellow-700"
                    }`}>
                      {u.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* New Upcharge */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-bold text-gray-900 mb-4">Upcharge登録</h2>
            <UpchargeForm cardId={card.id} />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Customer */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-bold text-gray-900 mb-3">顧客情報</h2>
            <p className="font-medium text-gray-900">{customerName}</p>
            <p className="text-sm text-gray-500">{card.customer.email}</p>
          </div>

          {/* Status control */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-bold text-gray-900 mb-3">ステータス更新</h2>
            <CardStatusForm cardId={card.id} currentStatus={card.status} />
          </div>

          {/* Status history */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-bold text-gray-900 mb-3">ステータス履歴</h2>
            <div className="space-y-2">
              {card.statusHistory.map((h) => (
                <div key={h.id} className="flex justify-between items-start text-xs">
                  <span className="text-gray-700">{STATUS_LABELS[h.status] ?? h.status}</span>
                  <span className="text-gray-400">{format(new Date(h.changedAt), "MM/dd HH:mm")}</span>
                </div>
              ))}
            </div>
          </div>

          {/* QR */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-bold text-gray-900 mb-3">QRコード</h2>
            <a
              href={`/api/qrcode?cardId=${card.id}`}
              target="_blank"
              className="block w-full bg-gray-100 text-gray-700 text-center py-3 rounded-lg hover:bg-gray-200 transition text-sm font-medium"
            >
              📱 QRコードを印刷
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
