import { Router } from "express";
import type { Request, Response } from "express";
import Stripe from "stripe";
import { z } from "zod";
import { env } from "../config.js";
import { prisma } from "../db.js";

const checkoutRouter = Router();
const stripe = new Stripe(env.STRIPE_SECRET_KEY);
type CurrencyCode = "EUR" | "USD";

const quoteSchema = z.object({
  currency: z.enum(["EUR", "USD"]),
  countryCode: z.string().trim().length(2).transform((val) => val.toUpperCase()),
  promoCode: z.string().trim().min(1).optional(),
  items: z
    .array(
      z.object({
        variantId: z.string().min(1),
        qty: z.number().int().positive().max(20)
      })
    )
    .min(1)
});

const sessionSchema = quoteSchema.extend({
  customer: z.object({
    email: z.string().email(),
    fullName: z.string().trim().min(2),
    address: z.object({
      line1: z.string().trim().min(2),
      line2: z.string().trim().optional(),
      city: z.string().trim().min(2),
      postalCode: z.string().trim().min(2),
      countryCode: z.string().trim().length(2).transform((val) => val.toUpperCase())
    })
  }),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional()
});

function isPriceActive(price: { isActive: boolean; validFrom: Date | null; validTo: Date | null }, now: Date) {
  return price.isActive && (price.validFrom === null || price.validFrom <= now) && (price.validTo === null || price.validTo >= now);
}

function calculatePromoDiscount(input: {
  promo: {
    type: "PERCENT" | "FIXED";
    value: number;
    currency: CurrencyCode | null;
    minOrderAmountMinor: number | null;
    maxDiscountMinor: number | null;
  };
  currency: CurrencyCode;
  subtotalMinor: number;
}) {
  const { promo, currency, subtotalMinor } = input;

  if (promo.currency && promo.currency !== currency) {
    return 0;
  }

  if (promo.minOrderAmountMinor !== null && subtotalMinor < promo.minOrderAmountMinor) {
    return 0;
  }

  let discountMinor = 0;

  if (promo.type === "PERCENT") {
    discountMinor = Math.floor((subtotalMinor * promo.value) / 100);
  } else {
    discountMinor = promo.value;
  }

  if (promo.maxDiscountMinor !== null) {
    discountMinor = Math.min(discountMinor, promo.maxDiscountMinor);
  }

  discountMinor = Math.min(discountMinor, subtotalMinor);

  return Math.max(0, discountMinor);
}

function generateOrderNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `DBF-${date}-${random}`;
}

async function computeQuote(input: z.infer<typeof quoteSchema>) {
  const { currency, countryCode, promoCode, items } = input;
  const now = new Date();

  const variants = await prisma.productVariant.findMany({
    where: {
      id: { in: items.map((i) => i.variantId) },
      isActive: true,
      product: { isActive: true }
    },
    include: {
      product: true,
      prices: true,
      inventory: true
    }
  });

  const variantById = new Map(variants.map((variant) => [variant.id, variant]));

  const lineItems: Array<{
    variantId: string;
    productId: string;
    slug: string;
    name: string;
    sku: string;
    size: string;
    color: string;
    qty: number;
    unitPriceMinor: number;
    lineTotalMinor: number;
  }> = [];

  for (const item of items) {
    const variant = variantById.get(item.variantId);
    if (!variant) {
      throw new Error(`Variant not found or inactive: ${item.variantId}`);
    }

    const price = variant.prices.find((p) => p.currency === currency && isPriceActive(p, now));
    if (!price) {
      throw new Error(`No active ${currency} price for variant ${variant.id}`);
    }

    const availableStock = variant.inventory ? Math.max(0, variant.inventory.quantity - variant.inventory.reservedQuantity) : 0;
    if (availableStock < item.qty) {
      throw new Error(`Not enough stock for variant ${variant.id}`);
    }

    lineItems.push({
      variantId: variant.id,
      productId: variant.productId,
      slug: variant.product.slug,
      name: variant.product.name,
      sku: variant.sku,
      size: variant.size,
      color: variant.color,
      qty: item.qty,
      unitPriceMinor: price.amountMinor,
      lineTotalMinor: price.amountMinor * item.qty
    });
  }

  const subtotalMinor = lineItems.reduce((sum, li) => sum + li.lineTotalMinor, 0);

  let discountMinor = 0;
  let appliedPromoCode: string | null = null;
  let appliedPromoCodeId: string | null = null;

  if (promoCode) {
    const normalizedCode = promoCode.trim().toUpperCase();
    const promo = await prisma.promoCode.findFirst({
      where: {
        code: normalizedCode,
        isActive: true,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }]
      }
    });

    if (!promo) {
      throw new Error("Promo code is invalid or expired");
    }

    if (promo.usageLimit !== null && promo.usedCount >= promo.usageLimit) {
      throw new Error("Promo code usage limit reached");
    }

    discountMinor = calculatePromoDiscount({
      promo: {
        type: promo.type,
        value: promo.value,
        currency: promo.currency,
        minOrderAmountMinor: promo.minOrderAmountMinor,
        maxDiscountMinor: promo.maxDiscountMinor
      },
      currency,
      subtotalMinor
    });

    appliedPromoCode = promo.code;
    appliedPromoCodeId = promo.id;
  }

  const discountedSubtotalMinor = Math.max(0, subtotalMinor - discountMinor);

  const zone = await prisma.shippingZone.findFirst({
    where: {
      countryCode,
      isActive: true
    }
  });

  if (!zone) {
    throw new Error(`Shipping unavailable for country: ${countryCode}`);
  }

  const shippingRate = await prisma.shippingRate.findFirst({
    where: {
      zoneId: zone.id,
      currency,
      isActive: true,
      minOrderMinor: { lte: discountedSubtotalMinor },
      maxOrderMinor: { gte: discountedSubtotalMinor }
    },
    orderBy: { minOrderMinor: "desc" }
  });

  if (!shippingRate) {
    throw new Error(`No shipping rate for ${countryCode} with ${currency} subtotal ${discountedSubtotalMinor}`);
  }

  const shippingMinor = shippingRate.amountMinor;
  const totalMinor = discountedSubtotalMinor + shippingMinor;

  return {
    currency,
    countryCode,
    lineItems,
    subtotalMinor,
    discountMinor,
    shippingMinor,
    totalMinor,
    promoCode: appliedPromoCode,
    promoCodeId: appliedPromoCodeId,
    shippingEstimateDays: {
      min: shippingRate.estimatedDaysMin,
      max: shippingRate.estimatedDaysMax
    }
  };
}

checkoutRouter.post("/checkout/quote", async (req: Request, res: Response) => {
  const parsed = quoteSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.flatten() });
  }

  let quote: Awaited<ReturnType<typeof computeQuote>>;

  try {
    quote = await computeQuote(parsed.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to compute quote";
    return res.status(400).json({ message });
  }

  return res.status(200).json({
    currency: quote.currency,
    countryCode: quote.countryCode,
    pricingSource: "database",
    items: quote.lineItems,
    subtotalMinor: quote.subtotalMinor,
    discountMinor: quote.discountMinor,
    shippingMinor: quote.shippingMinor,
    totalMinor: quote.totalMinor,
    promoCode: quote.promoCode,
    shippingEstimateDays: quote.shippingEstimateDays
  });
});

checkoutRouter.post("/checkout/session", async (req: Request, res: Response) => {
  const parsed = sessionSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.flatten() });
  }

  let quote: Awaited<ReturnType<typeof computeQuote>>;

  try {
    quote = await computeQuote(parsed.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to compute quote";
    return res.status(400).json({ message });
  }

  const { customer, successUrl, cancelUrl } = parsed.data;

  const order = await prisma.order.create({
    data: {
      orderNumber: generateOrderNumber(),
      status: "PENDING",
      currency: quote.currency,
      subtotalMinor: quote.subtotalMinor,
      discountMinor: quote.discountMinor,
      shippingMinor: quote.shippingMinor,
      totalMinor: quote.totalMinor,
      email: customer.email,
      fullName: customer.fullName,
      addressJson: customer.address,
      countryCode: quote.countryCode,
      promoCodeId: quote.promoCodeId,
      items: {
        create: quote.lineItems.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          sku: item.sku,
          nameSnapshot: item.name,
          sizeSnapshot: item.size,
          colorSnapshot: item.color,
          unitPriceMinor: item.unitPriceMinor,
          qty: item.qty,
          lineTotalMinor: item.lineTotalMinor
        }))
      }
    }
  });

  const stripeSession = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: successUrl ?? `${env.FRONTEND_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl ?? `${env.FRONTEND_URL}/checkout/cancel`,
    customer_email: customer.email,
    metadata: {
      orderId: order.id,
      orderNumber: order.orderNumber
    },
    line_items: [
      ...quote.lineItems.map((item) => ({
        quantity: item.qty,
        price_data: {
          currency: quote.currency.toLowerCase(),
          unit_amount: item.unitPriceMinor,
          product_data: {
            name: `${item.name} (${item.size} / ${item.color})`
          }
        }
      })),
      {
        quantity: 1,
        price_data: {
          currency: quote.currency.toLowerCase(),
          unit_amount: quote.shippingMinor,
          product_data: {
            name: `Shipping (${quote.countryCode})`
          }
        }
      }
    ]
  });

  await prisma.order.update({
    where: { id: order.id },
    data: {
      stripeCheckoutSessionId: stripeSession.id
    }
  });

  return res.status(200).json({
    checkoutUrl: stripeSession.url,
    sessionId: stripeSession.id,
    orderId: order.id,
    orderNumber: order.orderNumber
  });
});

export { checkoutRouter };
