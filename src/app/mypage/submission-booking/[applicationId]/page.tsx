export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCustomerSession } from "@/lib/customer-auth";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import CustomerHeader from "@/components/CustomerHeader";
import CancelBookingButton from "../CancelBookingButton";
import { format } from "date-fns";

export const metadata = { title: "提出予約の詳細 | トレカビンクス" };

const METHOD_LABELS: Record<string, string> = {
  STORE_DROP_OFF: "店頭持込",
  SHIPPING: "郵送",
};
const LANG_LABELS: Record<string, string> = {
  JAPANESE: "日本語",
  ENGLISH: "英語",
};
const SERVICE_LABELS: Record<string, string> = {
  VALUE: "バリュー",
  VALUE_BULK: "バリューバルク",
  VALUE_PLUS: "バリュープラス",
  VALUE_MAX: "バリューマックス",
  REGULAR: "レギュラー",
  EXPRESS: "エクスプレス",
  SUPER_EXPRESS: "スーパー・エクスプレス",
  WALK_THROUGH: "ウォーク・スルー",
  PREMIUM_1: "プレミアム 1",
  PREMIUM_2: "プレミアム 2",
  PREMIUM_3: "プレミアム 3",
  PREMIUM_5: "プレミアム 5",
  PREMIUM_10: "プレミアム 10",
};

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const customer = await getCustomerSession();
  if (!customer) redirect("/login");

  const { applicationId } = await params;
  const app = await prisma.application.findFirst({
    where: { id: applicationId, customerId: customer.id },
    include: {
      submissionBooking: true,
      cards: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!app) redirect("/mypage/submission-booking");

  const booking =
    app.submissionBooking && app.submissionBooking.status === "BOOKED" ? app.submissionBooking : null;
  if (!booking) redirect(`/mypage/submission-booking/${app.id}/edit`);

  const name = decrypt(customer.nameEncrypted);
  const totalQty = app.cards.reduce((sum, c) => sum + c.quantity, 0);
  const isStore = booking.method === "STORE_DROP_OFF";

  return (
    <div className="min-h-screen bg-gray-50">
      <CustomerHeader title="提出予約の詳細" />

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-5">
        <Link href="/mypage/submission-booking" className="text-sm text-gray-500 hover:text-gray-700">
          ← 予約一覧へ戻る
        </Link>

        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">
          提出予約を受け付けました。{isStore ? "店頭で" : "到着後に"}スタッフがこのリストと現物を照合します。
        </div>

        {/* レシート本体 */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="bg-brand-600 text-white px-6 py-4">
            <p className="text-sm text-white/80">カード提出リスト</p>
            <p className="text-2xl font-bold tracking-wide">{app.applicationNo}</p>
          </div>

          <div className="px-6 py-4 grid grid-cols-2 gap-y-3 gap-x-4 text-sm border-b border-gray-100">
            <div>
              <p className="text-gray-400">予約日時</p>
              <p className="font-bold text-gray-900">{format(new Date(booking.scheduledAt), "yyyy/MM/dd HH:mm")}</p>
            </div>
            <div>
              <p className="text-gray-400">提出方法</p>
              <p className="font-bold text-gray-900">{METHOD_LABELS[booking.method] ?? booking.method}</p>
            </div>
            <div>
              <p className="text-gray-400">お名前</p>
              <p className="font-bold text-gray-900">{name} 様</p>
            </div>
            <div>
              <p className="text-gray-400">サービス</p>
              <p className="font-bold text-gray-900">{SERVICE_LABELS[app.serviceLevel] ?? app.serviceLevel}</p>
            </div>
          </div>

          {/* カード明細（現物照合用） */}
          <div className="px-6 py-4">
            <p className="text-sm font-bold text-gray-900 mb-2">
              カード明細（{app.cards.length}種・計{totalQty}枚）
            </p>
            {app.cards.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
                代理申込のため、明細はカードお預け後にスタッフが入力します。当日は現物をお持ちください。
              </div>
            ) : (
            <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
              {app.cards.map((card, i) => (
                <div key={card.id} className="flex items-start gap-3 px-3 py-2.5">
                  <span className="shrink-0 w-6 h-6 rounded-full border border-gray-300 text-xs font-bold text-gray-500 flex items-center justify-center">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-gray-900 leading-snug">{card.cardName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {card.tcgTitle}
                      {card.cardNumber ? ` ・ ${card.cardNumber}` : ""} ・ {LANG_LABELS[card.language] ?? card.language}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-gray-900">×{card.quantity}</p>
                    <p className="text-xs text-gray-400">¥{card.declaredValue.toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>

          <div className="px-6 py-4 bg-gray-50 text-xs text-gray-600 leading-relaxed">
            {isStore
              ? "店頭にお持ち込みください。スタッフがこのリストと現物（枚数・カード名）を1点ずつ照合します。"
              : "郵送でお送りください。到着後、スタッフがこのリストと現物を照合します。"}
            <br />
            ※ 提出方法・日時の変更は下のボタンから行えます。
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Link
            href={`/mypage/submission-booking/${app.id}/edit`}
            className="inline-block border border-gray-300 rounded-lg px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            予約を変更
          </Link>
          <CancelBookingButton bookingId={booking.id} />
        </div>
      </main>
    </div>
  );
}
