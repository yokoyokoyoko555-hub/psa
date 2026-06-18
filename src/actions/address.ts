"use server";

import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";
import { getCustomerSession } from "@/lib/customer-auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export interface Address {
  id: string;
  name: string;
  postalCode: string;
  prefecture: string;
  address: string;
  address2?: string;
  phone?: string;
  isDefault: boolean;
}

const addressSchema = z.object({
  name: z.string().min(1).max(100),
  postalCode: z.string().regex(/^\d{7}$/),
  prefecture: z.string().min(1),
  address: z.string().min(1),
  address2: z.string().optional(),
  phone: z.string().optional(),
});

export async function getMyAddresses(): Promise<Address[]> {
  const customer = await getCustomerSession();
  if (!customer) return [];

  const rows = await prisma.customerAddress.findMany({
    where: { customerId: customer.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  return rows.map((a) => ({
    id: a.id,
    name: decrypt(a.nameEncrypted),
    postalCode: a.postalCode,
    prefecture: decrypt(a.prefectureEncrypted),
    address: decrypt(a.addressEncrypted),
    address2: a.address2Encrypted ? decrypt(a.address2Encrypted) : undefined,
    phone: a.phoneEncrypted ? decrypt(a.phoneEncrypted) : undefined,
    isDefault: a.isDefault,
  }));
}

export async function createAddress(
  input: z.infer<typeof addressSchema>
): Promise<{ success: boolean; error?: string; addresses?: Address[] }> {
  const customer = await getCustomerSession();
  if (!customer) return { success: false, error: "ログインが必要です" };

  const parsed = addressSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "入力内容が正しくありません" };

  const count = await prisma.customerAddress.count({ where: { customerId: customer.id } });
  const makeDefault = count === 0; // 最初の住所は自動でデフォルト

  await prisma.customerAddress.create({
    data: {
      customerId: customer.id,
      nameEncrypted: encrypt(parsed.data.name),
      postalCode: parsed.data.postalCode,
      prefectureEncrypted: encrypt(parsed.data.prefecture),
      addressEncrypted: encrypt(parsed.data.address),
      address2Encrypted: parsed.data.address2 ? encrypt(parsed.data.address2) : null,
      phoneEncrypted: parsed.data.phone ? encrypt(parsed.data.phone) : null,
      isDefault: makeDefault,
    },
  });

  revalidatePath("/mypage/addresses");
  return { success: true, addresses: await getMyAddresses() };
}

export async function updateAddress(
  id: string,
  input: z.infer<typeof addressSchema>
): Promise<{ success: boolean; error?: string; addresses?: Address[] }> {
  const customer = await getCustomerSession();
  if (!customer) return { success: false, error: "ログインが必要です" };

  const parsed = addressSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "入力内容が正しくありません" };

  const owned = await prisma.customerAddress.findFirst({ where: { id, customerId: customer.id } });
  if (!owned) return { success: false, error: "住所が見つかりません" };

  await prisma.customerAddress.update({
    where: { id },
    data: {
      nameEncrypted: encrypt(parsed.data.name),
      postalCode: parsed.data.postalCode,
      prefectureEncrypted: encrypt(parsed.data.prefecture),
      addressEncrypted: encrypt(parsed.data.address),
      address2Encrypted: parsed.data.address2 ? encrypt(parsed.data.address2) : null,
      phoneEncrypted: parsed.data.phone ? encrypt(parsed.data.phone) : null,
    },
  });

  revalidatePath("/mypage/addresses");
  return { success: true, addresses: await getMyAddresses() };
}

export async function deleteAddress(
  id: string
): Promise<{ success: boolean; error?: string; addresses?: Address[] }> {
  const customer = await getCustomerSession();
  if (!customer) return { success: false, error: "ログインが必要です" };

  const owned = await prisma.customerAddress.findFirst({ where: { id, customerId: customer.id } });
  if (!owned) return { success: false, error: "住所が見つかりません" };

  await prisma.customerAddress.delete({ where: { id } });

  // デフォルトを削除した場合、残りの先頭をデフォルトに
  if (owned.isDefault) {
    const next = await prisma.customerAddress.findFirst({
      where: { customerId: customer.id },
      orderBy: { createdAt: "asc" },
    });
    if (next) {
      await prisma.customerAddress.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  }

  revalidatePath("/mypage/addresses");
  return { success: true, addresses: await getMyAddresses() };
}

export async function setDefaultAddress(
  id: string
): Promise<{ success: boolean; error?: string; addresses?: Address[] }> {
  const customer = await getCustomerSession();
  if (!customer) return { success: false, error: "ログインが必要です" };

  const owned = await prisma.customerAddress.findFirst({ where: { id, customerId: customer.id } });
  if (!owned) return { success: false, error: "住所が見つかりません" };

  await prisma.$transaction([
    prisma.customerAddress.updateMany({
      where: { customerId: customer.id },
      data: { isDefault: false },
    }),
    prisma.customerAddress.update({ where: { id }, data: { isDefault: true } }),
  ]);

  revalidatePath("/mypage/addresses");
  return { success: true, addresses: await getMyAddresses() };
}
