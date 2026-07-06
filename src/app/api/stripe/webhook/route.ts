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
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
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
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await upsertSubscription(event.data.object as Stripe.Subscription);
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
      // 代理申込（source=STORE）の先払いはカード未入力のためstatusをDRAFTのまま維持する
      // （スタッフの明細入力完了時にSUBMITTEDへ進む。ADR-0020）。自己入力（source=CUSTOMER）のみここで確定させる。
      const app = await prisma.application.findUnique({
        where: { id: payment.applicationId },
        select: { source: true },
      });
      if (app?.source === "CUSTOMER") {
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

const SUB_STATUSES = [
  "ACTIVE",
  "TRIALING",
  "PAST_DUE",
  "CANCELED",
  "INCOMPLETE",
  "INCOMPLETE_EXPIRED",
  "UNPAID",
];

// Stripe Subscription を自社 Subscription テーブルへ upsert（ADR-0013 / CENTERING_TOOL.md）
async function upsertSubscription(sub: Stripe.Subscription) {
  const customer = await prisma.customer.findFirst({
    where: { stripeCustomerId: sub.customer as string },
  });
  if (!customer) {
    console.error("Webhook: customer not found for stripeCustomerId", sub.customer);
    return;
  }

  const up = String(sub.status).toUpperCase();
  // 未知ステータス（paused等）は ACTIVE/TRIALING に該当させず PAST_DUE 扱い＝利用不可側へ
  const status = (SUB_STATUSES.includes(up) ? up : "PAST_DUE") as never;

  // current_period_end はStripeのAPIバージョン差で top-level / items のどちらかにある。
  // 両方無ければ「即無効化」を避けるため約31日後を仮置き（後続イベントで正される）。
  const subAny = sub as unknown as {
    current_period_end?: number;
    items?: { data?: { current_period_end?: number }[] };
  };
  const cpe = subAny.current_period_end ?? subAny.items?.data?.[0]?.current_period_end;
  const periodEnd = cpe
    ? new Date(cpe * 1000)
    : new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
  const priceId = sub.items?.data?.[0]?.price?.id ?? "";

  console.log("Webhook upsertSubscription", { sub: sub.id, status: up, periodEnd });

  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: sub.id },
    create: {
      customerId: customer.id,
      stripeSubscriptionId: sub.id,
      stripePriceId: priceId,
      status,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
    },
    update: {
      status,
      stripePriceId: priceId,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
    },
  });
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
