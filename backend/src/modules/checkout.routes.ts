import { Currency, PromoType } from "@prisma/client";
import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../db.js";

const checkoutRouter = Router();

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

function isPriceActive(price: { isActive: boolean; validFrom: Date | null; validTo: Date | null }, now: Date) {
  return price.isActive && (price.validFrom === null || price.validFrom <= now) && (price.validTo === null || price.validTo >= now);
}

function calculatePromoDiscount(input: {
  promo: {
    type: PromoType;
    value: number;
    currency: Currency | null;
    minOrderAmountMinor: number | null;
    maxDiscountMinor: number | null;
  };
  currency: Currency;
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

  if (promo.type === PromoType.PERCENT) {
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

checkoutRouter.post("/checkout/quote", async (req: Request, res: Response) => {
  const parsed = quoteSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.flatten() });
  }

  const { currency, countryCode, promoCode, items } = parsed.data;
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
      return res.status(400).json({ message: `Variant not found or inactive: ${item.variantId}` });
    }

    const price = variant.prices.find((p) => p.currency === currency && isPriceActive(p, now));
    if (!price) {
      return res.status(400).json({ message: `No active ${currency} price for variant ${variant.id}` });
    }

    const availableStock = variant.inventory ? Math.max(0, variant.inventory.quantity - variant.inventory.reservedQuantity) : 0;
    if (availableStock < item.qty) {
      return res.status(400).json({ message: `Not enough stock for variant ${variant.id}`, availableStock });
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
      return res.status(400).json({ message: "Promo code is invalid or expired" });
    }

    if (promo.usageLimit !== null && promo.usedCount >= promo.usageLimit) {
      return res.status(400).json({ message: "Promo code usage limit reached" });
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
  }

  const discountedSubtotalMinor = Math.max(0, subtotalMinor - discountMinor);

  const zone = await prisma.shippingZone.findFirst({
    where: {
      countryCode,
      isActive: true
    }
  });

  if (!zone) {
    return res.status(400).json({ message: `Shipping unavailable for country: ${countryCode}` });
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
    return res.status(400).json({
      message: `No shipping rate for ${countryCode} with ${currency} subtotal ${discountedSubtotalMinor}`
    });
  }

  const shippingMinor = shippingRate.amountMinor;
  const totalMinor = discountedSubtotalMinor + shippingMinor;

  return res.status(200).json({
    currency,
    countryCode,
    pricingSource: "database",
    items: lineItems,
    subtotalMinor,
    discountMinor,
    shippingMinor,
    totalMinor,
    promoCode: appliedPromoCode,
    shippingEstimateDays: {
      min: shippingRate.estimatedDaysMin,
      max: shippingRate.estimatedDaysMax
    }
  });
});

export { checkoutRouter };
