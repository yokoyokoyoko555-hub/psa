"use server";

import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";
import { createCustomerSession, deleteCustomerSession, getCustomerSession } from "@/lib/customer-auth";
import { createCustomer as createStripeCustomer } from "@/lib/stripe";
import { logOperation, getClientIp } from "@/lib/operation-log";
import { generateMemberNo } from "@/lib/number-generator";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

// ===== 新規登録のメール認証 =====

const emailSchema = z.object({
  email: z.string().email(),
  hp: z.string().optional(), // ハニーポット
});

/**
 * メールアドレスを受け取り、確認リンクを送信する（24時間有効）。
 * SMTP未設定時はテスト用に devLink を返す（設定後は自動でメール送信）。
 */
export async function requestRegistration(
  input: z.infer<typeof emailSchema>
): Promise<{ success: boolean; error?: string; sent?: boolean; devLink?: string }> {
  const parsed = emailSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "メールアドレスが正しくありません" };

  if (parsed.data.hp && parsed.data.hp.trim() !== "") {
    return { success: false, error: "送信に失敗しました" };
  }

  const email = parsed.data.email.toLowerCase();

  const existing = await prisma.customer.findUnique({ where: { email } });
  if (existing) {
    return { success: false, error: "このメールアドレスはすでに登録されています" };
  }

  const { randomBytes } = await import("crypto");
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await prisma.emailVerification.create({ data: { email, token, expiresAt } });

  const base = process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "";
  const verifyUrl = `${base}/register?token=${token}`;

  // SMTP未設定ならテスト用にリンクを返す
  if (!process.env.SMTP_HOST) {
    return { success: true, sent: false, devLink: verifyUrl };
  }

  try {
    const { sendMail, registrationVerificationHtml } = await import("@/lib/mailer");
    await sendMail({
      to: email,
      subject: "【トレカビンクス】会員登録のご案内",
      html: registrationVerificationHtml({ verifyUrl }),
    });
    return { success: true, sent: true };
  } catch {
    return { success: true, sent: false, devLink: verifyUrl };
  }
}

/** トークンを検証し、有効なら対象メールを返す（登録ページの表示用） */
export async function verifyRegistrationToken(
  token: string
): Promise<{ valid: boolean; email?: string }> {
  const rec = await prisma.emailVerification.findUnique({ where: { token } });
  if (!rec || rec.consumedAt || rec.expiresAt < new Date()) {
    return { valid: false };
  }
  return { valid: true, email: rec.email };
}

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  nameKana: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().regex(/^[0-9-+() ]{10,20}$/),
  postalCode: z.string().regex(/^\d{7}$/),
  prefecture: z.string().min(1),
  address: z.string().min(1),
  address2: z.string().optional(),
  password: z.string().min(8).max(100),
  token: z.string().min(1), // メール認証トークン
  hp: z.string().optional(), // ハニーポット（人間は空、Botが埋める）
});

export type RegisterInput = z.infer<typeof registerSchema>;

export async function registerCustomer(
  input: RegisterInput
): Promise<{ success: boolean; error?: string }> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "入力内容が正しくありません" };
  }

  // Bot対策（ハニーポット）: 隠しフィールドが埋められていたら拒否
  if (parsed.data.hp && parsed.data.hp.trim() !== "") {
    return { success: false, error: "登録に失敗しました" };
  }

  // メール認証トークンの検証（メール所有確認）
  const verification = await prisma.emailVerification.findUnique({
    where: { token: parsed.data.token },
  });
  if (!verification || verification.consumedAt || verification.expiresAt < new Date()) {
    return { success: false, error: "認証リンクが無効か期限切れです。最初からやり直してください。" };
  }
  if (verification.email.toLowerCase() !== parsed.data.email.toLowerCase()) {
    return { success: false, error: "メールアドレスが一致しません。" };
  }

  const existing = await prisma.customer.findUnique({
    where: { email: parsed.data.email },
  });
  if (existing) {
    return { success: false, error: "このメールアドレスはすでに登録されています" };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  // Stripeカスタマー作成
  const stripeCustomer = await createStripeCustomer({
    email: parsed.data.email,
    name: parsed.data.name,
    phone: parsed.data.phone,
  });

  const memberNo = await generateMemberNo();

  const customer = await prisma.customer.create({
    data: {
      memberNo,
      nameEncrypted: encrypt(parsed.data.name),
      nameKanaEncrypted: encrypt(parsed.data.nameKana),
      email: parsed.data.email,
      phoneEncrypted: encrypt(parsed.data.phone),
      postalCode: parsed.data.postalCode,
      prefectureEncrypted: encrypt(parsed.data.prefecture),
      addressEncrypted: encrypt(parsed.data.address),
      address2Encrypted: parsed.data.address2 ? encrypt(parsed.data.address2) : null,
      passwordHash,
      stripeCustomerId: stripeCustomer.id,
      emailVerified: new Date(), // 認証リンク経由なので確認済み
    },
  });

  // トークンを消費（再利用防止）
  await prisma.emailVerification.update({
    where: { id: verification.id },
    data: { consumedAt: new Date() },
  });

  const hdrs = await headers();
  await logOperation({
    customerId: customer.id,
    ipAddress: getClientIp({ headers: hdrs } as unknown as Request),
    action: "CUSTOMER_REGISTER",
    targetType: "customers",
    targetId: customer.id,
  });

  await createCustomerSession(customer.id);
  return { success: true };
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function loginCustomer(
  input: z.infer<typeof loginSchema>
): Promise<{ success: boolean; error?: string }> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "入力内容が正しくありません" };

  const customer = await prisma.customer.findUnique({
    where: { email: parsed.data.email, isActive: true },
  });
  if (!customer) return { success: false, error: "メールアドレスまたはパスワードが正しくありません" };

  const valid = await bcrypt.compare(parsed.data.password, customer.passwordHash);
  if (!valid) return { success: false, error: "メールアドレスまたはパスワードが正しくありません" };

  const hdrs = await headers();
  await logOperation({
    customerId: customer.id,
    ipAddress: getClientIp({ headers: hdrs } as unknown as Request),
    action: "CUSTOMER_LOGIN",
    targetType: "customers",
    targetId: customer.id,
  });

  await createCustomerSession(customer.id);
  return { success: true };
}

export async function logoutCustomer(): Promise<void> {
  await deleteCustomerSession();
  redirect("/login");
}

export interface CustomerProfile {
  id: string;
  memberNo: string | null;
  name: string;
  nameKana: string;
  email: string;
  phone: string;
  postalCode: string;
  prefecture: string;
  address: string;
  address2?: string;
}

const updateProfileSchema = z.object({
  name: z.string().min(1).max(100),
  nameKana: z.string().min(1).max(100),
  phone: z.string().regex(/^[0-9-+() ]{10,20}$/),
  postalCode: z.string().regex(/^\d{7}$/),
  prefecture: z.string().min(1),
  address: z.string().min(1),
  address2: z.string().optional(),
});

export async function updateCustomerProfile(
  input: z.infer<typeof updateProfileSchema>
): Promise<{ success: boolean; error?: string }> {
  const customer = await getCustomerSession();
  if (!customer) return { success: false, error: "ログインが必要です" };

  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "入力内容が正しくありません" };
  }

  await prisma.customer.update({
    where: { id: customer.id },
    data: {
      nameEncrypted: encrypt(parsed.data.name),
      nameKanaEncrypted: encrypt(parsed.data.nameKana),
      phoneEncrypted: encrypt(parsed.data.phone),
      postalCode: parsed.data.postalCode,
      prefectureEncrypted: encrypt(parsed.data.prefecture),
      addressEncrypted: encrypt(parsed.data.address),
      address2Encrypted: parsed.data.address2 ? encrypt(parsed.data.address2) : null,
    },
  });

  const hdrs = await headers();
  await logOperation({
    customerId: customer.id,
    ipAddress: getClientIp({ headers: hdrs } as unknown as Request),
    action: "CUSTOMER_PROFILE_UPDATE",
    targetType: "customers",
    targetId: customer.id,
  });

  revalidatePath("/mypage/profile");
  revalidatePath("/mypage");
  return { success: true };
}

export async function getCustomerProfile(): Promise<CustomerProfile | null> {
  const customer = await getCustomerSession();
  if (!customer) return null;

  return {
    id: customer.id,
    memberNo: customer.memberNo,
    name: decrypt(customer.nameEncrypted),
    nameKana: decrypt(customer.nameKanaEncrypted),
    email: customer.email,
    phone: decrypt(customer.phoneEncrypted),
    postalCode: customer.postalCode,
    prefecture: decrypt(customer.prefectureEncrypted),
    address: decrypt(customer.addressEncrypted),
    address2: customer.address2Encrypted ? decrypt(customer.address2Encrypted) : undefined,
  };
}
