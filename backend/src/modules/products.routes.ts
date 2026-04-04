import { Router } from "express";
import type { Request, Response } from "express";
import { prisma } from "../db.js";

const productsRouter = Router();

function pickActivePrice(
  prices: Array<{ currency: string; amountMinor: number; isActive: boolean; validFrom: Date | null; validTo: Date | null }>,
  currency: "EUR",
  now: Date
) {
  return prices.find(
    (p) =>
      p.currency === currency &&
      p.isActive &&
      (p.validFrom === null || p.validFrom <= now) &&
      (p.validTo === null || p.validTo >= now)
  );
}

productsRouter.get("/products", async (req: Request, res: Response) => {
  const currency = "EUR" as const;
  const now = new Date();

  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      variants: {
        where: { isActive: true },
        include: {
          prices: true,
          inventory: true
        }
      }
    }
  });

  const payload = products
    .map((product) => {
      const variants = product.variants
        .map((variant) => {
          const price = pickActivePrice(variant.prices, currency, now);
          if (!price) {
            return null;
          }

          return {
            id: variant.id,
            sku: variant.sku,
            size: variant.size,
            color: variant.color,
            price: {
              currency,
              amountMinor: price.amountMinor
            },
            stock: variant.inventory ? Math.max(0, variant.inventory.quantity - variant.inventory.reservedQuantity) : 0
          };
        })
        .filter((v): v is NonNullable<typeof v> => v !== null);

      if (variants.length === 0) {
        return null;
      }

      return {
        id: product.id,
        slug: product.slug,
        name: product.name,
        description: product.description,
        images: product.images.map((img) => ({
          path: img.path,
          alt: img.alt,
          isMain: img.isMain
        })),
        variants
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  return res.status(200).json(payload);
});

productsRouter.get("/products/:slug", async (req: Request, res: Response) => {
  const rawSlug = req.params.slug;
  const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug;
  const currency = "EUR" as const;
  const now = new Date();

  if (!slug) {
    return res.status(400).json({ message: "Missing product slug" });
  }

  const product = await prisma.product.findFirst({
    where: { slug, isActive: true },
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      variants: {
        where: { isActive: true },
        include: {
          prices: true,
          inventory: true
        }
      }
    }
  });

  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }

  const variants = product.variants
    .map((variant) => {
      const price = pickActivePrice(variant.prices, currency, now);
      if (!price) {
        return null;
      }

      return {
        id: variant.id,
        sku: variant.sku,
        size: variant.size,
        color: variant.color,
        price: {
          currency,
          amountMinor: price.amountMinor
        },
        stock: variant.inventory ? Math.max(0, variant.inventory.quantity - variant.inventory.reservedQuantity) : 0
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  return res.status(200).json({
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    images: product.images.map((img) => ({
      path: img.path,
      alt: img.alt,
      isMain: img.isMain
    })),
    variants
  });
});

export { productsRouter };
