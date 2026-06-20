"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logOperation } from "@/lib/operation-log";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

const notificationSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(10000),
  showOnMypage: z.boolean().default(true),
  isPublished: z.boolean().default(false),
});

const visibilitySchema = z.object({
  id: z.string().min(1),
  showOnMypage: z.boolean(),
});

const publishSchema = z.object({
  id: z.string().min(1),
  isPublished: z.boolean(),
});

async function requireAdminOrStaff() {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id) throw new Error("Unauthorized");
  if (!["ADMIN", "STAFF"].includes(user.role ?? "")) throw new Error("Forbidden");
  return { id: user.id, role: user.role };
}

export async function createNotification(
  input: z.infer<typeof notificationSchema>
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdminOrStaff();

  const parsed = notificationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "タイトルと本文を入力してください" };
  }

  const notification = await prisma.notification.create({
    data: {
      customerId: null,
      type: "SYSTEM",
      title: parsed.data.title,
      body: parsed.data.body,
      isPublished: parsed.data.isPublished,
      showOnMypage: parsed.data.showOnMypage,
      sentAt: parsed.data.isPublished ? new Date() : null,
    },
  });

  const hdrs = await headers();
  await logOperation({
    userId: user.id,
    ipAddress: (hdrs as unknown as Headers).get?.("x-forwarded-for") ?? "unknown",
    action: parsed.data.isPublished ? "NOTIFICATION_PUBLISH" : "NOTIFICATION_DRAFT_CREATE",
    targetType: "notifications",
    targetId: notification.id,
    after: { title: notification.title },
  });

  revalidatePath("/admin/notifications");
  revalidatePath("/mypage");

  return { success: true };
}

export async function updateNotification(
  input: z.infer<typeof notificationSchema>
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdminOrStaff();

  const parsed = notificationSchema.safeParse(input);
  if (!parsed.success || !parsed.data.id) {
    return { success: false, error: "タイトルと本文を入力してください" };
  }

  const current = await prisma.notification.findUnique({
    where: { id: parsed.data.id },
  });
  if (!current) return { success: false, error: "お知らせが見つかりません" };

  const notification = await prisma.notification.update({
    where: { id: parsed.data.id },
    data: {
      title: parsed.data.title,
      body: parsed.data.body,
      isPublished: parsed.data.isPublished,
      showOnMypage: parsed.data.showOnMypage,
      sentAt: parsed.data.isPublished && !current.sentAt ? new Date() : current.sentAt,
    },
  });

  const hdrs = await headers();
  await logOperation({
    userId: user.id,
    ipAddress: (hdrs as unknown as Headers).get?.("x-forwarded-for") ?? "unknown",
    action: parsed.data.isPublished ? "NOTIFICATION_UPDATE_PUBLISH" : "NOTIFICATION_UPDATE_DRAFT",
    targetType: "notifications",
    targetId: notification.id,
    after: { title: notification.title, isPublished: notification.isPublished },
  });

  revalidatePath("/admin/notifications");
  revalidatePath(`/admin/notifications/${notification.id}`);
  revalidatePath("/mypage");
  revalidatePath("/mypage/notifications");

  return { success: true };
}

export async function updateNotificationVisibility(
  input: z.infer<typeof visibilitySchema>
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdminOrStaff();

  const parsed = visibilitySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "入力内容が正しくありません" };
  }

  const notification = await prisma.notification.update({
    where: { id: parsed.data.id },
    data: { showOnMypage: parsed.data.showOnMypage },
  });

  const hdrs = await headers();
  await logOperation({
    userId: user.id,
    ipAddress: (hdrs as unknown as Headers).get?.("x-forwarded-for") ?? "unknown",
    action: "NOTIFICATION_VISIBILITY_UPDATE",
    targetType: "notifications",
    targetId: notification.id,
    after: { showOnMypage: notification.showOnMypage },
  });

  revalidatePath("/admin/notifications");
  revalidatePath("/mypage");
  revalidatePath("/mypage/notifications");

  return { success: true };
}

export async function updateNotificationPublishStatus(
  input: z.infer<typeof publishSchema>
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdminOrStaff();

  const parsed = publishSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "入力内容が正しくありません" };
  }

  const current = await prisma.notification.findUnique({ where: { id: parsed.data.id } });
  if (!current) return { success: false, error: "お知らせが見つかりません" };

  const notification = await prisma.notification.update({
    where: { id: parsed.data.id },
    data: {
      isPublished: parsed.data.isPublished,
      sentAt: parsed.data.isPublished && !current.sentAt ? new Date() : current.sentAt,
    },
  });

  const hdrs = await headers();
  await logOperation({
    userId: user.id,
    ipAddress: (hdrs as unknown as Headers).get?.("x-forwarded-for") ?? "unknown",
    action: "NOTIFICATION_PUBLISH_STATUS_UPDATE",
    targetType: "notifications",
    targetId: notification.id,
    after: { isPublished: notification.isPublished },
  });

  revalidatePath("/admin/notifications");
  revalidatePath(`/admin/notifications/${notification.id}`);
  revalidatePath("/mypage");
  revalidatePath("/mypage/notifications");

  return { success: true };
}
