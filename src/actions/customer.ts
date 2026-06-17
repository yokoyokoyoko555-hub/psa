"use server";

import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";
import { createCustomerSession, deleteCustomerSession, getCustomerSession } from "@/lib/customer-auth";
import { createCustomer as createStripeCustomer } from "@/lib/stripe";
import { logOperation, getClientIp } from "@/lib/operation-log";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

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
});

export type RegisterInput = z.infer<typeof registerSchema>;

export async function registerCustomer(
  input: RegisterInput
): Promise<{ success: boolean; error?: string }> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "入力内容が正しくありません" };
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

  const customer = await prisma.customer.create({
    data: {
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
    },
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
  name: string;
  nameKana: string;
  email: string;
  phone: string;
  postalCode: string;
  prefecture: string;
  address: string;
  address2?: string;
}

export async function getCustomerProfile(): Promise<CustomerProfile | null> {
  const customer = await getCustomerSession();
  if (!customer) return null;

  return {
    id: customer.id,
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
