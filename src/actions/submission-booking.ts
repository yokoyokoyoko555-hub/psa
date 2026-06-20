"use server";

import { prisma } from "@/lib/prisma";
import { getCustomerSession } from "@/lib/customer-auth";
import { auth } from "@/lib/auth";
import { logOperation } from "@/lib/operation-log";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

const bookingSchema = z.object({
  applicationId: z.string().min(1),
  method: z.enum(["STORE_DROP_OFF", "SHIPPING"]),
  scheduledAt: z.string().datetime({ offset: true }),
  note: z.string().max(500).optional(),
});

const calendarDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isClosed: z.boolean(),
  isShippingDay: z.boolean(),
  note: z.string().max(300).optional(),
});

async function requireAdminOrStaff() {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id) throw new Error("Unauthorized");
  if (!["ADMIN", "STAFF"].includes(user.role ?? "")) throw new Error("Forbidden");
  return { id: user.id, role: user.role ?? "" };
}

function getHeaderIp(hdrs: Headers) {
  return hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? hdrs.get("x-real-ip") ?? "unknown";
}

function dateKeyToJstDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00+09:00`);
}

export async function upsertSubmissionBooking(
  input: z.infer<typeof bookingSchema>
): Promise<{ success: boolean; error?: string }> {
  const customer = await getCustomerSession();
  if (!customer) return { success: false, error: "ログインが必要です" };

  const parsed = bookingSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "予約内容を確認してください" };

  const scheduledAt = new Date(parsed.data.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) {
    return { success: false, error: "予約日時を確認してください" };
  }
  if (scheduledAt.getTime() <= Date.now()) {
    return { success: false, error: "未来の日時を選択してください" };
  }
  const dateKey = parsed.data.scheduledAt.slice(0, 10);
  const calendarDay = await prisma.submissionCalendarDay.findUnique({
    where: { date: dateKeyToJstDate(dateKey) },
  });
  if (calendarDay?.isClosed) {
    return { success: false, error: "この日は予約受付不可です。別の日を選択してください" };
  }

  const application = await prisma.application.findFirst({
    where: { id: parsed.data.applicationId, customerId: customer.id },
    include: { payments: { select: { status: true } } },
  });
  if (!application) return { success: false, error: "申込が見つかりません" };
  if (application.status === "DRAFT" || application.status === "CANCELLED") {
    return { success: false, error: "この申込は予約できません" };
  }
  if (!application.payments.some((p) => p.status === "SUCCEEDED")) {
    return { success: false, error: "お支払い完了後に予約できます" };
  }

  const booking = await prisma.submissionBooking.upsert({
    where: { applicationId: application.id },
    update: {
      method: parsed.data.method,
      scheduledAt,
      note: parsed.data.note?.trim() || null,
      status: "BOOKED",
    },
    create: {
      customerId: customer.id,
      applicationId: application.id,
      method: parsed.data.method,
      scheduledAt,
      note: parsed.data.note?.trim() || null,
    },
  });

  const hdrs = await headers();
  await logOperation({
    customerId: customer.id,
    ipAddress: getHeaderIp(hdrs),
    action: "SUBMISSION_BOOKING_UPSERT",
    targetType: "submission_bookings",
    targetId: booking.id,
    after: {
      applicationId: application.id,
      method: parsed.data.method,
      scheduledAt: scheduledAt.toISOString(),
    },
  });

  revalidatePath("/mypage");
  revalidatePath("/mypage/submission-booking");
  revalidatePath(`/mypage/applications/${application.id}`);
  revalidatePath("/admin/submission-bookings");
  return { success: true };
}

export async function cancelSubmissionBooking(
  bookingId: string
): Promise<{ success: boolean; error?: string }> {
  const customer = await getCustomerSession();
  if (!customer) return { success: false, error: "ログインが必要です" };

  const booking = await prisma.submissionBooking.findFirst({
    where: { id: bookingId, customerId: customer.id },
  });
  if (!booking) return { success: false, error: "予約が見つかりません" };

  await prisma.submissionBooking.update({
    where: { id: booking.id },
    data: { status: "CANCELLED" },
  });

  const hdrs = await headers();
  await logOperation({
    customerId: customer.id,
    ipAddress: getHeaderIp(hdrs),
    action: "SUBMISSION_BOOKING_CANCEL",
    targetType: "submission_bookings",
    targetId: booking.id,
  });

  revalidatePath("/mypage/submission-booking");
  revalidatePath(`/mypage/applications/${booking.applicationId}`);
  revalidatePath("/admin/submission-bookings");
  return { success: true };
}

export async function cancelSubmissionBookingByAdmin(
  bookingId: string
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdminOrStaff();
  const booking = await prisma.submissionBooking.findUnique({ where: { id: bookingId } });
  if (!booking) return { success: false, error: "予約が見つかりません" };

  await prisma.submissionBooking.update({
    where: { id: booking.id },
    data: { status: "CANCELLED" },
  });

  const hdrs = await headers();
  await logOperation({
    userId: user.id,
    ipAddress: getHeaderIp(hdrs),
    action: "ADMIN_SUBMISSION_BOOKING_CANCEL",
    targetType: "submission_bookings",
    targetId: booking.id,
  });

  revalidatePath("/admin/submission-bookings");
  revalidatePath(`/admin/applications/${booking.applicationId}`);
  revalidatePath(`/mypage/applications/${booking.applicationId}`);
  return { success: true };
}

export async function upsertSubmissionCalendarDay(
  input: z.infer<typeof calendarDaySchema>
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdminOrStaff();
  const parsed = calendarDaySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "日付設定を確認してください" };

  const date = dateKeyToJstDate(parsed.data.date);
  const day = await prisma.submissionCalendarDay.upsert({
    where: { date },
    update: {
      isClosed: parsed.data.isClosed,
      isShippingDay: parsed.data.isShippingDay,
      note: parsed.data.note?.trim() || null,
    },
    create: {
      date,
      isClosed: parsed.data.isClosed,
      isShippingDay: parsed.data.isShippingDay,
      note: parsed.data.note?.trim() || null,
    },
  });

  const hdrs = await headers();
  await logOperation({
    userId: user.id,
    ipAddress: getHeaderIp(hdrs),
    action: "SUBMISSION_CALENDAR_DAY_UPSERT",
    targetType: "submission_calendar_days",
    targetId: day.id,
    after: {
      date: parsed.data.date,
      isClosed: parsed.data.isClosed,
      isShippingDay: parsed.data.isShippingDay,
    },
  });

  revalidatePath("/admin/submission-bookings");
  revalidatePath("/mypage/submission-booking");
  return { success: true };
}
