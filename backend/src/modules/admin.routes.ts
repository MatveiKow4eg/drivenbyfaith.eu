import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { env } from "../config.js";
import { prisma } from "../db.js";

const adminRouter = Router();

type AdminRole = "OWNER" | "ADMIN" | "SUPPORT";
type CurrencyCode = "EUR" | "USD";
type VariantSize = "S" | "M" | "L" | "XL" | "XXL" | "XXXL";

type AuthenticatedRequest = Request & {
  admin?: {
    id: string;
    email: string;
    role: AdminRole;
  };
};

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

const createProductSchema = z.object({
  slug: z.string().trim().min(2),
  name: z.string().trim().min(2),
  description: z.string().trim().optional(),
  isActive: z.boolean().optional()
});

const updateProductSchema = z.object({
  slug: z.string().trim().min(2).optional(),
  name: z.string().trim().min(2).optional(),
  description: z.string().trim().optional(),
  isActive: z.boolean().optional()
});

const addImageSchema = z.object({
  path: z.string().trim().min(2),
  alt: z.string().trim().optional(),
  isMain: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional()
});

const createVariantSchema = z.object({
  productId: z.string().min(1),
  size: z.enum(["S", "M", "L", "XL", "XXL", "XXXL"]),
  color: z.string().trim().min(2),
  sku: z.string().trim().min(2),
  isActive: z.boolean().optional(),
  inventoryQty: z.number().int().min(0).default(0),
  priceEURMinor: z.number().int().positive(),
  priceUSDMinor: z.number().int().positive()
});

const updateVariantSchema = z.object({
  size: z.enum(["S", "M", "L", "XL", "XXL", "XXXL"]).optional(),
  color: z.string().trim().min(2).optional(),
  sku: z.string().trim().min(2).optional(),
  isActive: z.boolean().optional()
});

const setPricesSchema = z.object({
  eurMinor: z.number().int().positive(),
  usdMinor: z.number().int().positive()
});

const setInventorySchema = z.object({
  quantity: z.number().int().min(0),
  reservedQuantity: z.number().int().min(0).optional()
});

const updateOrderStatusSchema = z.object({
  status: z.enum(["PENDING", "PAID", "PROCESSING", "SHIPPED", "CANCELED", "REFUNDED"])
});

const createPromoSchema = z.object({
  code: z.string().trim().min(3).transform((v) => v.toUpperCase()),
  type: z.enum(["PERCENT", "FIXED"]),
  value: z.number().int().positive(),
  currency: z.enum(["EUR", "USD"]).optional(),
  minOrderAmountMinor: z.number().int().min(0).optional(),
  maxDiscountMinor: z.number().int().min(0).optional(),
  usageLimit: z.number().int().positive().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  isActive: z.boolean().optional()
});

const updatePromoSchema = createPromoSchema.partial();

function signAdminToken(payload: { id: string; email: string; role: AdminRole }) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "7d" });
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing bearer token" });
  }

  const token = authHeader.slice("Bearer ".length).trim();

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as { id: string; email: string; role: AdminRole };
    req.admin = decoded;
    return next();
  } catch (_error) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

async function writeAuditLog(input: {
  adminUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  diffJson?: unknown;
}) {
  await prisma.auditLog.create({
    data: {
      adminUserId: input.adminUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      diffJson: input.diffJson ?? undefined
    }
  });
}

adminRouter.post("/admin/auth/login", async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.flatten() });
  }

  const { email, password } = parsed.data;

  const admin = await prisma.adminUser.findFirst({
    where: {
      email: email.toLowerCase(),
      isActive: true
    }
  });

  if (!admin) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() }
  });

  const token = signAdminToken({
    id: admin.id,
    email: admin.email,
    role: admin.role as AdminRole
  });

  return res.status(200).json({
    token,
    admin: {
      id: admin.id,
      email: admin.email,
      role: admin.role
    }
  });
});

adminRouter.get("/admin/me", requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  return res.status(200).json({ admin: req.admin });
});

adminRouter.get("/admin/products", requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      variants: {
        include: {
          prices: true,
          inventory: true
        }
      }
    }
  });

  return res.status(200).json(products);
});

adminRouter.post("/admin/products", requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const parsed = createProductSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.flatten() });
  }

  const created = await prisma.product.create({
    data: {
      slug: parsed.data.slug,
      name: parsed.data.name,
      description: parsed.data.description,
      isActive: parsed.data.isActive ?? true
    }
  });

  await writeAuditLog({
    adminUserId: req.admin!.id,
    action: "CREATE",
    entityType: "Product",
    entityId: created.id,
    diffJson: parsed.data
  });

  return res.status(201).json(created);
});

adminRouter.patch("/admin/products/:id", requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const id = firstParam(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "Missing product id" });
  }

  const parsed = updateProductSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.flatten() });
  }

  const product = await prisma.product.update({
    where: { id },
    data: {
      slug: parsed.data.slug,
      name: parsed.data.name,
      description: parsed.data.description,
      isActive: parsed.data.isActive
    }
  });

  await writeAuditLog({
    adminUserId: req.admin!.id,
    action: "UPDATE",
    entityType: "Product",
    entityId: product.id,
    diffJson: parsed.data
  });

  return res.status(200).json(product);
});

adminRouter.post("/admin/products/:id/images", requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const id = firstParam(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "Missing product id" });
  }

  const parsed = addImageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.flatten() });
  }

  if (parsed.data.isMain) {
    await prisma.productImage.updateMany({
      where: { productId: id, isMain: true },
      data: { isMain: false }
    });
  }

  const image = await prisma.productImage.create({
    data: {
      productId: id,
      path: parsed.data.path,
      alt: parsed.data.alt,
      isMain: parsed.data.isMain ?? false,
      sortOrder: parsed.data.sortOrder ?? 0
    }
  });

  await writeAuditLog({
    adminUserId: req.admin!.id,
    action: "CREATE",
    entityType: "ProductImage",
    entityId: image.id,
    diffJson: parsed.data
  });

  return res.status(201).json(image);
});

adminRouter.post("/admin/variants", requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const parsed = createVariantSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.flatten() });
  }

  const created = await prisma.productVariant.create({
    data: {
      productId: parsed.data.productId,
      size: parsed.data.size as VariantSize,
      color: parsed.data.color,
      sku: parsed.data.sku,
      isActive: parsed.data.isActive ?? true
    }
  });

  await prisma.inventory.create({
    data: {
      variantId: created.id,
      quantity: parsed.data.inventoryQty,
      reservedQuantity: 0
    }
  });

  await prisma.price.createMany({
    data: [
      {
        variantId: created.id,
        currency: "EUR" as CurrencyCode,
        amountMinor: parsed.data.priceEURMinor,
        isActive: true
      },
      {
        variantId: created.id,
        currency: "USD" as CurrencyCode,
        amountMinor: parsed.data.priceUSDMinor,
        isActive: true
      }
    ]
  });

  await writeAuditLog({
    adminUserId: req.admin!.id,
    action: "CREATE",
    entityType: "ProductVariant",
    entityId: created.id,
    diffJson: parsed.data
  });

  return res.status(201).json(created);
});

adminRouter.patch("/admin/variants/:id", requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const id = firstParam(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "Missing variant id" });
  }

  const parsed = updateVariantSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.flatten() });
  }

  const variant = await prisma.productVariant.update({
    where: { id },
    data: {
      size: parsed.data.size as VariantSize | undefined,
      color: parsed.data.color,
      sku: parsed.data.sku,
      isActive: parsed.data.isActive
    }
  });

  await writeAuditLog({
    adminUserId: req.admin!.id,
    action: "UPDATE",
    entityType: "ProductVariant",
    entityId: variant.id,
    diffJson: parsed.data
  });

  return res.status(200).json(variant);
});

adminRouter.put("/admin/variants/:id/prices", requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const id = firstParam(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "Missing variant id" });
  }

  const parsed = setPricesSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.flatten() });
  }

  await prisma.price.updateMany({
    where: {
      variantId: id,
      currency: { in: ["EUR", "USD"] }
    },
    data: { isActive: false }
  });

  await prisma.price.createMany({
    data: [
      {
        variantId: id,
        currency: "EUR" as CurrencyCode,
        amountMinor: parsed.data.eurMinor,
        isActive: true
      },
      {
        variantId: id,
        currency: "USD" as CurrencyCode,
        amountMinor: parsed.data.usdMinor,
        isActive: true
      }
    ]
  });

  await writeAuditLog({
    adminUserId: req.admin!.id,
    action: "UPDATE",
    entityType: "Price",
    entityId: id,
    diffJson: parsed.data
  });

  return res.status(200).json({ ok: true });
});

adminRouter.patch("/admin/variants/:id/inventory", requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const id = firstParam(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "Missing variant id" });
  }

  const parsed = setInventorySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.flatten() });
  }

  const inventory = await prisma.inventory.upsert({
    where: { variantId: id },
    update: {
      quantity: parsed.data.quantity,
      reservedQuantity: parsed.data.reservedQuantity ?? 0
    },
    create: {
      variantId: id,
      quantity: parsed.data.quantity,
      reservedQuantity: parsed.data.reservedQuantity ?? 0
    }
  });

  await writeAuditLog({
    adminUserId: req.admin!.id,
    action: "UPDATE",
    entityType: "Inventory",
    entityId: inventory.id,
    diffJson: parsed.data
  });

  return res.status(200).json(inventory);
});

adminRouter.get("/admin/orders", requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      items: true,
      promoCode: true
    }
  });

  return res.status(200).json(orders);
});

adminRouter.patch("/admin/orders/:id/status", requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const id = firstParam(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "Missing order id" });
  }

  const parsed = updateOrderStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.flatten() });
  }

  const order = await prisma.order.update({
    where: { id },
    data: { status: parsed.data.status }
  });

  await writeAuditLog({
    adminUserId: req.admin!.id,
    action: "UPDATE",
    entityType: "Order",
    entityId: order.id,
    diffJson: parsed.data
  });

  return res.status(200).json(order);
});

adminRouter.get("/admin/promocodes", requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  const codes = await prisma.promoCode.findMany({ orderBy: { createdAt: "desc" } });
  return res.status(200).json(codes);
});

adminRouter.post("/admin/promocodes", requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const parsed = createPromoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.flatten() });
  }

  const created = await prisma.promoCode.create({
    data: {
      code: parsed.data.code,
      type: parsed.data.type,
      value: parsed.data.value,
      currency: parsed.data.currency,
      minOrderAmountMinor: parsed.data.minOrderAmountMinor,
      maxDiscountMinor: parsed.data.maxDiscountMinor,
      usageLimit: parsed.data.usageLimit,
      startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : undefined,
      endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : undefined,
      isActive: parsed.data.isActive ?? true
    }
  });

  await writeAuditLog({
    adminUserId: req.admin!.id,
    action: "CREATE",
    entityType: "PromoCode",
    entityId: created.id,
    diffJson: parsed.data
  });

  return res.status(201).json(created);
});

adminRouter.patch("/admin/promocodes/:id", requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const id = firstParam(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "Missing promo id" });
  }

  const parsed = updatePromoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.flatten() });
  }

  const updated = await prisma.promoCode.update({
    where: { id },
    data: {
      code: parsed.data.code,
      type: parsed.data.type,
      value: parsed.data.value,
      currency: parsed.data.currency,
      minOrderAmountMinor: parsed.data.minOrderAmountMinor,
      maxDiscountMinor: parsed.data.maxDiscountMinor,
      usageLimit: parsed.data.usageLimit,
      startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : undefined,
      endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : undefined,
      isActive: parsed.data.isActive
    }
  });

  await writeAuditLog({
    adminUserId: req.admin!.id,
    action: "UPDATE",
    entityType: "PromoCode",
    entityId: updated.id,
    diffJson: parsed.data
  });

  return res.status(200).json(updated);
});

export { adminRouter };
