import { NextRequest, NextResponse } from "next/server";
import { constructWebhookEvent } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(body, signature);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        await handlePaymentSucceeded(pi);
        break;
      }
      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        await handlePaymentFailed(pi);
        break;
      }
      case "payment_method.attached": {
        const pm = event.data.object as Stripe.PaymentMethod;
        await handlePaymentMethodAttached(pm);
        break;
      }
    }
  } catch (err) {
    console.error("Webhook handler error:", err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handlePaymentSucceeded(pi: Stripe.PaymentIntent) {
  const payment = await prisma.payment.findFirst({
    where: { stripePaymentIntentId: pi.id },
  });

  if (payment) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "SUCCEEDED", paidAt: new Date() },
    });

    if (payment.applicationId) {
      await prisma.application.update({
        where: { id: payment.applicationId },
        data: { status: "SUBMITTED" },
      });
      // カードステータスを一括更新
      await prisma.card.updateMany({
        where: { applicationId: payment.applicationId },
        data: { status: "SUBMITTED_BY_CUSTOMER" },
      });
    }
  }

  // Upcharge決済
  const upcharge = await prisma.upcharge.findFirst({
    where: { stripePaymentIntentId: pi.id },
  });
  if (upcharge) {
    await prisma.upcharge.update({
      where: { id: upcharge.id },
      data: { status: "PAID", paidAt: new Date() },
    });
    await prisma.card.update({
      where: { id: upcharge.cardId },
      data: { status: "UPCHARGE_PAID" },
    });
  }

  // PaymentMethod保存
  if (pi.payment_method && pi.customer) {
    const pm = pi.payment_method as Stripe.PaymentMethod;
    if (typeof pm === "object" && pm.card) {
      const customer = await prisma.customer.findFirst({
        where: { stripeCustomerId: pi.customer as string },
      });
      if (customer) {
        const existing = await prisma.savedPaymentMethod.findFirst({
          where: { stripePaymentMethodId: pm.id },
        });
        if (!existing) {
          const hasDefault = await prisma.savedPaymentMethod.findFirst({
            where: { customerId: customer.id, isDefault: true },
          });
          await prisma.savedPaymentMethod.create({
            data: {
              customerId: customer.id,
              stripePaymentMethodId: pm.id,
              brand: pm.card.brand,
              last4: pm.card.last4,
              expMonth: pm.card.exp_month,
              expYear: pm.card.exp_year,
              isDefault: !hasDefault,
            },
          });
        }
      }
    }
  }
}

async function handlePaymentFailed(pi: Stripe.PaymentIntent) {
  await prisma.payment.updateMany({
    where: { stripePaymentIntentId: pi.id },
    data: {
      status: "FAILED",
      failureReason: pi.last_payment_error?.message,
    },
  });

  const upcharge = await prisma.upcharge.findFirst({
    where: { stripePaymentIntentId: pi.id },
  });
  if (upcharge) {
    await prisma.upcharge.update({
      where: { id: upcharge.id },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        failureReason: pi.last_payment_error?.message,
      },
    });
    await prisma.card.update({
      where: { id: upcharge.cardId },
      data: { status: "UPCHARGE_UNPAID" },
    });
  }
}

async function handlePaymentMethodAttached(pm: Stripe.PaymentMethod) {
  if (!pm.customer || !pm.card) return;

  const customer = await prisma.customer.findFirst({
    where: { stripeCustomerId: pm.customer as string },
  });
  if (!customer) return;

  const existing = await prisma.savedPaymentMethod.findFirst({
    where: { stripePaymentMethodId: pm.id },
  });
  if (existing) return;

  const hasDefault = await prisma.savedPaymentMethod.findFirst({
    where: { customerId: customer.id, isDefault: true },
  });

  await prisma.savedPaymentMethod.create({
    data: {
      customerId: customer.id,
      stripePaymentMethodId: pm.id,
      brand: pm.card.brand,
      last4: pm.card.last4,
      expMonth: pm.card.exp_month,
      expYear: pm.card.exp_year,
      isDefault: !hasDefault,
    },
  });
}
