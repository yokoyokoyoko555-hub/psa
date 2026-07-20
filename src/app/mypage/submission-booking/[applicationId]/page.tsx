export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCustomerSession } from "@/lib/customer-auth";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import CustomerHeader from "@/components/CustomerHeader";
import Footer from "@/components/Footer";
import { format } from "date-fns";
import { REGION_LABELS, ITEM_TYPE_LABELS, resolveServiceLevel } from "@/lib/application-status";

export const metadata = { title: "提出予約の詳細 | トレカビンクス" };

const METHOD_LABELS: Record<string, string> = {
  STORE_DROP_OFF: "店頭持込",
  SHIPPING: "郵送",
};

const CARD_QUANTITY_UNIT: Record<string, string> = {
  TRADING_CARD: "枚",
  UNOPENED_PACK: "枚",
  COMIC_MAGAZINE: "冊",
};

const SUPPLY_STORE_URL = "https://torecabinks2.ocnk.net/product-group/3";

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
    include: { submissionBooking: true, cards: { orderBy: { lineNo: "asc" } } },
  });
  if (!app) redirect("/mypage/submission-booking");

  const booking =
    app.submissionBooking && app.submissionBooking.status === "BOOKED" ? app.submissionBooking : null;
  if (!booking) redirect(`/mypage/submission-booking/${app.id}/edit`);

  const name = decrypt(customer.nameEncrypted);
  const isStore = booking.method === "STORE_DROP_OFF";
  const quantityUnit = CARD_QUANTITY_UNIT[app.itemType] ?? "枚";

  // 申込内容通りの順番でご提出いただくため、提出先・アイテム種別・サービスレベル単位でまとめて表示する（管理画面・申込詳細と同じ並び）。ADR-0038
  const cardGroupMap = new Map<string, typeof app.cards>();
  for (const card of app.cards) {
    const key = card.customServiceLevelName ?? resolveServiceLevel(app);
    const bucket = cardGroupMap.get(key);
    if (bucket) bucket.push(card);
    else cardGroupMap.set(key, [card]);
  }
  const cardGroups = [...cardGroupMap.entries()].sort((a, b) => a[0].localeCompare(b[0], "ja"));

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <CustomerHeader title="提出予約の詳細" />

      <main className="flex-1 max-w-2xl mx-auto px-4 py-8 space-y-5">
        <Link href="/mypage/submission-booking" className="text-sm text-gray-500 hover:text-gray-700">
          ← 予約一覧へ戻る
        </Link>

        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">
          提出予約を受け付けました。{isStore ? "店頭ではこの受付番号のご提示とご本人様確認にて受付します。" : "到着後、スタッフが受け付けます。"}
        </div>

        {/* 受付番号カード */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="bg-brand-600 text-white px-6 py-4">
            <p className="text-sm text-white/80">受付番号</p>
            <p className="text-2xl font-bold tracking-wide">{app.applicationNo}</p>
          </div>

          <div className="px-6 py-4 grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
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
          </div>

          <div className="px-6 py-4 bg-gray-50 text-xs text-gray-600 leading-relaxed">
            {isStore ? (
              <>
                <p>店頭では、この受付番号の画面提示と本人確認書類（運転免許証等）でのご本人様確認を行います。</p>
                <p className="mt-2">カードは以下の準備をしてご提出お願いいたします。</p>
                <ol className="list-decimal pl-4 mt-1 space-y-1">
                  <li>カードはソフトスリーブにカードを入れ、スリーブに入ったカードをカードセイバーに入れてください。</li>
                  <li>面前にてカードの確認を行いますが、注文ごとにアイテムをグループ分けして番号通りに並べてご提出お願いいたします。</li>
                </ol>
              </>
            ) : (
              <>
                <p>郵送では以下の方法での郵送をお願いしております。</p>
                <p className="mt-2">カードは以下の準備をしてご提出お願いいたします。</p>
                <ol className="list-decimal pl-4 mt-1 space-y-2">
                  <li>
                    カードはソフトスリーブにカードを入れ、スリーブに入ったカードをカードセイバーに入れてください。透明スリーブ・カードセイバーに入っていないカードのご提出はお受けしておりません。
                  </li>
                  <li>申込内容通りの順番に並べてご提出お願いいたします。</li>
                  <li>
                    郵送前のカードを事前に写真撮影お願いいたします。（ご提出は不要です）
                    <br />
                    当社は郵送受付後に動画撮影付きで開封および申込内容との一致確認を行っております。
                  </li>
                </ol>
                <p className="mt-2">
                  ソフトスリーブおよびカードセイバーは
                  <a
                    href={SUPPLY_STORE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-600 underline"
                  >
                    こちら
                  </a>
                  からお買い求めいただけます。
                </p>
              </>
            )}
            <p className="mt-2">※ 提出日時・方法の変更は左下のボタンから行えます。</p>
          </div>
        </div>

        {/* 申込内容通りの順番でご提出いただくためのカード一覧 */}
        {app.cards.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="font-bold text-gray-900 mb-1">カード一覧（{app.cards.length}{quantityUnit}）</h2>
            <p className="text-sm text-gray-500 mb-4">この順番に並べてご提出ください。</p>
            <div className="space-y-6">
              {cardGroups.map(([serviceLevelName, cards]) => (
                <div key={serviceLevelName}>
                  <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mb-2 px-3 py-2 bg-brand-50 border border-brand-100 rounded-lg text-xs text-brand-800">
                    <span className="font-bold">{REGION_LABELS[app.region] ?? app.region}</span>
                    {app.region === "PSA_US" && (
                      <>
                        <span className="text-brand-300">・</span>
                        <span>{ITEM_TYPE_LABELS[app.itemType] ?? app.itemType}</span>
                      </>
                    )}
                    <span className="text-brand-300">・</span>
                    <span className="font-bold">{serviceLevelName}</span>
                    <span className="text-brand-400">（{cards.length}{quantityUnit}）</span>
                  </div>
                  <div className="space-y-2">
                    {cards.map((card) => (
                      <div key={card.id} className="flex items-center gap-3 border border-gray-200 rounded-lg px-3 py-2">
                        {card.lineNo != null && (
                          <span className="shrink-0 w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-xs font-bold flex items-center justify-center">
                            {card.lineNo}
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900 text-sm truncate">{card.cardName}</p>
                          <p className="text-xs text-gray-500 truncate">{card.tcgTitle}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <Link
            href={`/mypage/submission-booking/${app.id}/edit`}
            className="inline-block border border-gray-300 rounded-lg px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            予約を変更
          </Link>
          <Link
            href={`/mypage/applications/${app.id}`}
            className="inline-block border border-gray-300 rounded-lg px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            申込内容を確認する
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
