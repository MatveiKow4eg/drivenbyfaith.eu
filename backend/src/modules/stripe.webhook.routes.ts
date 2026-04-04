import { Router } from "express";
import type { Request, Response } from "express";
import Stripe from "stripe";
import { env } from "../config.js";
import { prisma } from "../db.js";

const stripeWebhookRouter = Router();
const stripe = new Stripe(env.STRIPE_SECRET_KEY);

stripeWebhookRouter.post("/webhooks/stripe", async (req: Request, res: Response) => {
  const signature = req.headers["stripe-signature"];

  if (!signature || Array.isArray(signature)) {
    return res.status(400).send("Missing stripe-signature header");
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook signature verification failed";
    return res.status(400).send(message);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId;

    if (!orderId) {
      return res.status(200).json({ received: true, skipped: true, reason: "missing_order_id" });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true }
    });

    if (!order) {
      return res.status(200).json({ received: true, skipped: true, reason: "order_not_found" });
    }

    if (order.status === "PAID") {
      return res.status(200).json({ received: true, skipped: true, reason: "already_paid" });
    }

    try {
      for (const item of order.items) {
        const inventory = await prisma.inventory.findUnique({ where: { variantId: item.variantId } });
        const available = inventory ? Math.max(0, inventory.quantity - inventory.reservedQuantity) : 0;

        if (available < item.qty) {
          throw new Error(`Insufficient stock for variant ${item.variantId}`);
        }

        await prisma.inventory.update({
          where: { variantId: item.variantId },
          data: {
            quantity: { decrement: item.qty }
          }
        });
      }

      if (order.promoCodeId) {
        await prisma.promoCode.update({
          where: { id: order.promoCodeId },
          data: { usedCount: { increment: 1 } }
        });
      }

      await prisma.order.update({
        where: { id: order.id },
        data: {
          status: "PAID",
          stripePaymentIntentId:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id ?? null
        }
      });
    } catch (error) {
      console.error("Failed to finalize order on checkout.session.completed", {
        orderId,
        sessionId: session.id,
        error
      });
      return res.status(500).json({ received: true, processed: false });
    }
  }

  return res.status(200).json({ received: true });
});

export { stripeWebhookRouter };
