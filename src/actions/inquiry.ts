"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { getCustomerSession } from "@/lib/customer-auth";
import { logOperation, getClientIp } from "@/lib/operation-log";
import { sendMail, inquiryReplyHtml } from "@/lib/mailer";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

async function requireAdminOrStaff() {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id) throw new Error("Unauthorized");
  if (!["ADMIN", "STAFF"].includes(user.role ?? "")) throw new Error("Forbidden");
  return { id: user.id, role: user.role };
}

const createInquirySchema = z.object({
  subject: z.string().min(1).max(120),
  body: z.string().min(1).max(4000),
  agreedHarassmentPolicy: z.literal(true),
  agreedPrivacyPolicy: z.literal(true),
});

/** 顧客が問い合わせを送信する。カスハラポリシー・個人情報同意の両方にチェックが必要。 */
export async function createInquiry(
  input: z.infer<typeof createInquirySchema>
): Promise<{ success: boolean; error?: string }> {
  const customer = await getCustomerSession();
  if (!customer) return { success: false, error: "ログインが必要です" };

  const parsed = createInquirySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "件名・内容を入力し、同意事項にチェックしてください" };
  }

  const inquiry = await prisma.inquiry.create({
    data: {
      customerId: customer.id,
      subject: parsed.data.subject,
      body: parsed.data.body,
      messages: {
        create: {
          sender: "CUSTOMER",
          body: parsed.data.body,
        },
      },
    },
  });

  const hdrs = await headers();
  await logOperation({
    customerId: customer.id,
    ipAddress: getClientIp({ headers: hdrs } as unknown as Request),
    action: "INQUIRY_CREATE",
    targetType: "inquiries",
    targetId: inquiry.id,
    after: { subject: inquiry.subject },
  });

  revalidatePath("/admin/inquiries");
  return { success: true };
}

/**
 * 顧客本人の問い合わせ履歴一覧（`/contact`ページで表示）。メール未達時の代替閲覧手段として、
 * 過去の質問・回答をここで確認できるようにする（スレッド返信は不可・1問1答のまま）。
 */
export async function getMyInquiries() {
  const customer = await getCustomerSession();
  if (!customer) return [];

  return prisma.inquiry.findMany({
    where: { customerId: customer.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      subject: true,
      body: true,
      status: true,
      replyText: true,
      repliedAt: true,
      allowCustomerReply: true,
      createdAt: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          sender: true,
          body: true,
          createdAt: true,
        },
      },
    },
  });
}

/** 管理画面の一覧表示用。未読を上位に表示する。 */
export async function getInquiries() {
  await requireAdminOrStaff();

  const inquiries = await prisma.inquiry.findMany({
    include: { customer: { select: { nameEncrypted: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });

  const statusPriority: Record<string, number> = { UNREAD: 0, READ: 1, REPLIED: 2 };
  return [...inquiries]
    .sort((a, b) => statusPriority[a.status] - statusPriority[b.status])
    .map((i) => ({
      id: i.id,
      subject: i.subject,
      status: i.status,
      customerId: i.customerId,
      customerName: decrypt(i.customer.nameEncrypted),
      customerEmail: i.customer.email,
      createdAt: i.createdAt,
      allowCustomerReply: i.allowCustomerReply,
    }));
}

/** 管理画面の詳細表示用。未読の場合は既読にする。 */
export async function getInquiryDetail(id: string) {
  await requireAdminOrStaff();

  const inquiry = await prisma.inquiry.findUnique({
    where: { id },
    include: {
      customer: { select: { nameEncrypted: true, email: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!inquiry) return null;

  if (inquiry.status === "UNREAD") {
    await prisma.inquiry.update({ where: { id }, data: { status: "READ" } });
    inquiry.status = "READ";
  }

  return {
    id: inquiry.id,
    subject: inquiry.subject,
    body: inquiry.body,
    status: inquiry.status,
    replyText: inquiry.replyText,
    repliedAt: inquiry.repliedAt,
    allowCustomerReply: inquiry.allowCustomerReply,
    createdAt: inquiry.createdAt,
    customerId: inquiry.customerId,
    customerName: decrypt(inquiry.customer.nameEncrypted),
    customerEmail: inquiry.customer.email,
    messages: buildInquiryMessages(inquiry),
  };
}

const replySchema = z.object({
  id: z.string().min(1),
  replyText: z.string().min(1).max(4000),
  allowCustomerReply: z.boolean().default(false),
});

/** 管理画面から問い合わせに回答する。顧客へメール通知を試みる（失敗しても処理は止めない）。 */
export async function replyToInquiry(
  input: z.infer<typeof replySchema>
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdminOrStaff();

  const parsed = replySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "回答内容を入力してください" };
  }

  const current = await prisma.inquiry.findUnique({
    where: { id: parsed.data.id },
    include: { customer: { select: { nameEncrypted: true, email: true } } },
  });
  if (!current) return { success: false, error: "お問い合わせが見つかりません" };

  const inquiry = await prisma.inquiry.update({
    where: { id: parsed.data.id },
    data: {
      replyText: parsed.data.replyText,
      repliedAt: new Date(),
      repliedBy: user.id,
      status: "REPLIED",
      allowCustomerReply: parsed.data.allowCustomerReply,
      messages: {
        create: {
          sender: "STAFF",
          body: parsed.data.replyText,
          userId: user.id,
        },
      },
    },
  });

  try {
    await sendMail({
      to: current.customer.email,
      subject: `【トレカビンクス】お問い合わせへの回答（${current.subject}）`,
      html: inquiryReplyHtml({
        customerName: decrypt(current.customer.nameEncrypted),
        subject: current.subject,
        replyText: parsed.data.replyText,
        appUrl: process.env.APP_URL!,
      }),
    });
  } catch {
    // メール送信失敗は握りつぶす（回答自体の登録は成功させる）。ADR-0018と同じ考え方
  }

  const hdrs = await headers();
  await logOperation({
    userId: user.id,
    ipAddress: getClientIp({ headers: hdrs } as unknown as Request),
    action: "INQUIRY_REPLY",
    targetType: "inquiries",
    targetId: inquiry.id,
  });

  revalidatePath("/admin/inquiries");
  revalidatePath(`/admin/inquiries/${inquiry.id}`);
  revalidatePath("/contact/history");
  return { success: true };
}

const customerReplySchema = z.object({
  id: z.string().min(1),
  body: z.string().min(1).max(4000),
});

/** 顧客が、管理画面で返信許可された問い合わせに追加返信する。 */
export async function replyToInquiryAsCustomer(
  input: z.infer<typeof customerReplySchema>
): Promise<{ success: boolean; error?: string }> {
  const customer = await getCustomerSession();
  if (!customer) return { success: false, error: "ログインが必要です" };

  const parsed = customerReplySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "返信内容を入力してください" };
  }

  const inquiry = await prisma.inquiry.findFirst({
    where: {
      id: parsed.data.id,
      customerId: customer.id,
      allowCustomerReply: true,
    },
    select: { id: true, subject: true },
  });
  if (!inquiry) return { success: false, error: "このお問い合わせには返信できません" };

  await prisma.inquiry.update({
    where: { id: inquiry.id },
    data: {
      status: "UNREAD",
      messages: {
        create: {
          sender: "CUSTOMER",
          body: parsed.data.body,
        },
      },
    },
  });

  const hdrs = await headers();
  await logOperation({
    customerId: customer.id,
    ipAddress: getClientIp({ headers: hdrs } as unknown as Request),
    action: "INQUIRY_CUSTOMER_REPLY",
    targetType: "inquiries",
    targetId: inquiry.id,
    after: { subject: inquiry.subject },
  });

  revalidatePath("/contact/history");
  revalidatePath("/admin/inquiries");
  revalidatePath(`/admin/inquiries/${inquiry.id}`);
  return { success: true };
}

type InquiryWithMessages = {
  id: string;
  body: string;
  replyText: string | null;
  repliedAt: Date | null;
  createdAt: Date;
  messages: { id: string; sender: "CUSTOMER" | "STAFF"; body: string; createdAt: Date }[];
};

function buildInquiryMessages(inquiry: InquiryWithMessages) {
  if (inquiry.messages.length > 0) return inquiry.messages;

  const messages: InquiryWithMessages["messages"] = [
    {
      id: `${inquiry.id}-body`,
      sender: "CUSTOMER",
      body: inquiry.body,
      createdAt: inquiry.createdAt,
    },
  ];

  if (inquiry.replyText) {
    messages.push({
      id: `${inquiry.id}-reply`,
      sender: "STAFF",
      body: inquiry.replyText,
      createdAt: inquiry.repliedAt ?? inquiry.createdAt,
    });
  }

  return messages;
}
