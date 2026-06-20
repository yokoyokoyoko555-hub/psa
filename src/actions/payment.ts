"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCustomerSession } from "@/lib/customer-auth";
import { getStripe } from "@/lib/stripe";

export async function deletePaymentMethod(methodId: string) {
  const session = await getCustomerSession();
  if (!session) return { error: "Unauthorized" };

  const method = await prisma.savedPaymentMethod.findUnique({
    where: { id: methodId },
  });
  if (!method || method.customerId !== session.id) {
    return { error: "Not found" };
  }

  // Detach from Stripe
  try {
    await getStripe().paymentMethods.detach(method.stripePaymentMethodId);
  } catch {
    // proceed with DB deletion even if Stripe fails
  }

  await prisma.savedPaymentMethod.delete({ where: { id: methodId } });

  revalidatePath("/mypage/settings");
  revalidatePath("/mypage/payment-methods");
  return { success: true };
}
