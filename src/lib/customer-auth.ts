"use server";

import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { randomBytes } from "crypto";

const SESSION_COOKIE = "customer_session";
const SESSION_EXPIRES_DAYS = 30;

export async function createCustomerSession(customerId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

  await prisma.customerSession.create({
    data: { customerId, sessionToken: token, expires },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires,
    path: "/",
  });

  return token;
}

export async function getCustomerSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.customerSession.findUnique({
    where: { sessionToken: token },
    include: { customer: true },
  });

  if (!session || session.expires < new Date()) {
    if (session) {
      await prisma.customerSession.delete({ where: { id: session.id } });
    }
    return null;
  }

  return session.customer;
}

export async function deleteCustomerSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.customerSession.deleteMany({ where: { sessionToken: token } });
    cookieStore.delete(SESSION_COOKIE);
  }
}
