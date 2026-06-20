"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logOperation } from "@/lib/operation-log";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

const notificationSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(10000),
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
      sentAt: new Date(),
    },
  });

  const hdrs = await headers();
  await logOperation({
    userId: user.id,
    ipAddress: (hdrs as unknown as Headers).get?.("x-forwarded-for") ?? "unknown",
    action: "NOTIFICATION_CREATE",
    targetType: "notifications",
    targetId: notification.id,
    after: { title: notification.title },
  });

  revalidatePath("/admin/notifications");
  revalidatePath("/mypage");

  return { success: true };
}
