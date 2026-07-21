export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCustomerSession } from "@/lib/customer-auth";
import { prisma } from "@/lib/prisma";
import CustomerHeader from "@/components/CustomerHeader";
import Footer from "@/components/Footer";
import { formatMoney } from "@/lib/currency";
import { getStoreSettings } from "@/actions/store-settings";
import BookingForm from "../../BookingForm";

// サーバーのタイムゾーン（Railway等はUTCが既定でJSTではない）に日付・時刻計算が左右されないよう、
// Dateの現地getterは使わずJST基準で明示的に変換する。admin/submission-bookings/page.tsxと同じ理由
// （現地getterのままだと、実際には空いている時間帯が「満席」と誤判定されるバグになる）。
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function toTimeKey(date: Date) {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  return `${String(jst.getUTCHours()).padStart(2, "0")}:${String(jst.getUTCMinutes()).padStart(2, "0")}`;
}

export const metadata = { title: "提出予約 | トレカビンクス" };

function toDateKey(date: Date) {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}-${String(jst.getUTCDate()).padStart(2, "0")}`;
}

/** JST基準の「今日0時」を絶対時刻として返す（サーバーのローカルタイムゾーンに依存しない）。 */
function todayJstMidnight(): Date {
  const nowJst = new Date(Date.now() + JST_OFFSET_MS);
  return new Date(Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth(), nowJst.getUTCDate()) - JST_OFFSET_MS);
}

export default async function EditBookingPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const customer = await getCustomerSession();
  if (!customer) redirect("/login");

  const { applicationId } = await params;
  // 支払い済み（SUCCEEDED な決済あり）のみ予約可。STORE/CUSTOMER 共通。ADR-0020
  // STORE は先払い後も status=DRAFT のため status では絞らず決済で判定する。
  const app = await prisma.application.findFirst({
    where: {
      id: applicationId,
      customerId: customer.id,
      status: { not: "CANCELLED" },
      payments: { some: { status: "SUCCEEDED" } },
    },
    include: { submissionBooking: true, _count: { select: { cards: true } } },
  });
  if (!app) redirect("/mypage/submission-booking");

  const today = todayJstMidnight();
  const [calendarDays, storeSettings, otherBookings] = await Promise.all([
    prisma.submissionCalendarDay.findMany({
      where: { date: { gte: today } },
      orderBy: { date: "asc" },
    }),
    getStoreSettings(),
    // 店頭持込の満席判定用。自分自身の既存予約は除外する。ADR-0035
    prisma.submissionBooking.findMany({
      where: {
        method: "STORE_DROP_OFF",
        status: "BOOKED",
        scheduledAt: { gte: today },
        applicationId: { not: applicationId },
      },
      select: { scheduledAt: true },
    }),
  ]);
  const takenSlots = otherBookings.map((b) => `${toDateKey(b.scheduledAt)}T${toTimeKey(b.scheduledAt)}`);

  const booking =
    app.submissionBooking && app.submissionBooking.status === "BOOKED"
      ? {
          id: app.submissionBooking.id,
          method: app.submissionBooking.method,
          scheduledAt: app.submissionBooking.scheduledAt.toISOString(),
          note: app.submissionBooking.note,
        }
      : null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <CustomerHeader title="提出予約" />

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-8 space-y-5">
        <Link href="/mypage/submission-booking" className="text-sm text-gray-500 hover:text-gray-700">
          ← 予約一覧へ戻る
        </Link>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="font-bold text-gray-900">{app.applicationNo}</p>
          <p className="text-sm text-gray-500 mt-0.5">
            {app.source === "STORE" && app._count.cards === 0
              ? "代理入力（お預け後にスタッフが明細を入力します）"
              : `${app._count.cards}枚 ・ ${formatMoney(app.totalAmount, app.region)}`}
          </p>
        </div>
        <BookingForm
          applicationId={app.id}
          existingBooking={booking}
          closedDates={calendarDays.filter((d) => d.isClosed).map((d) => toDateKey(d.date))}
          shippingDates={calendarDays.filter((d) => d.isShippingDay).map((d) => toDateKey(d.date))}
          takenSlots={takenSlots}
          storeAddress={
            storeSettings
              ? {
                  postalCode: storeSettings.postalCode,
                  address: storeSettings.address,
                  storeName: storeSettings.storeName,
                  phone: storeSettings.phone,
                }
              : null
          }
        />
      </main>
      <Footer />
    </div>
  );
}
