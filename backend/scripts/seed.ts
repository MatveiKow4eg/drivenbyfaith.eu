import bcrypt from "bcryptjs";
import { prisma } from "../src/db.js";

type VariantSeed = {
  size: "S" | "M" | "L" | "XL" | "XXL" | "XXXL";
  color: string;
  sku: string;
  eur: number;
  usd: number;
  stock: number;
};

const variants: VariantSeed[] = [
  { size: "S", color: "Black", sku: "DBF-TEE-BLK-S", eur: 3900, usd: 4300, stock: 25 },
  { size: "M", color: "Black", sku: "DBF-TEE-BLK-M", eur: 3900, usd: 4300, stock: 25 },
  { size: "L", color: "Black", sku: "DBF-TEE-BLK-L", eur: 3900, usd: 4300, stock: 25 },
  { size: "XL", color: "Black", sku: "DBF-TEE-BLK-XL", eur: 3900, usd: 4300, stock: 20 },
  { size: "XXL", color: "Black", sku: "DBF-TEE-BLK-XXL", eur: 4200, usd: 4600, stock: 15 },
  { size: "XXXL", color: "Black", sku: "DBF-TEE-BLK-XXXL", eur: 4400, usd: 4800, stock: 10 },
  { size: "S", color: "White", sku: "DBF-TEE-WHT-S", eur: 3900, usd: 4300, stock: 20 },
  { size: "M", color: "White", sku: "DBF-TEE-WHT-M", eur: 3900, usd: 4300, stock: 20 },
  { size: "L", color: "White", sku: "DBF-TEE-WHT-L", eur: 3900, usd: 4300, stock: 20 },
  { size: "XL", color: "White", sku: "DBF-TEE-WHT-XL", eur: 3900, usd: 4300, stock: 15 }
];

async function seedProductAndVariants() {
  const product = await prisma.product.upsert({
    where: { slug: "faith-core-tee" },
    update: {
      name: "Faith Core Tee",
      category: "T-Shirts",
      description: "Heavyweight cotton t-shirt. Sizes S-XXXL."
    },
    create: {
      slug: "faith-core-tee",
      name: "Faith Core Tee",
      category: "T-Shirts",
      description: "Heavyweight cotton t-shirt. Sizes S-XXXL.",
      isActive: true
    }
  });

  await prisma.productImage.upsert({
    where: { id: `${product.id}-main` },
    update: {
      path: "/products/sunrise.png",
      alt: "Faith Core Tee",
      isMain: true,
      sortOrder: 1,
      productId: product.id
    },
    create: {
      id: `${product.id}-main`,
      productId: product.id,
      path: "/products/sunrise.png",
      alt: "Faith Core Tee",
      isMain: true,
      sortOrder: 1
    }
  });

  const createdVariantIds: string[] = [];

  for (const variant of variants) {
    const savedVariant = await prisma.productVariant.upsert({
      where: { sku: variant.sku },
      update: {
        isActive: true,
        size: variant.size,
        color: variant.color,
        productId: product.id
      },
      create: {
        productId: product.id,
        size: variant.size,
        color: variant.color,
        sku: variant.sku,
        isActive: true
      }
    });

    createdVariantIds.push(savedVariant.id);

    await prisma.inventory.upsert({
      where: { variantId: savedVariant.id },
      update: {
        quantity: variant.stock,
        reservedQuantity: 0
      },
      create: {
        variantId: savedVariant.id,
        quantity: variant.stock,
        reservedQuantity: 0
      }
    });

    await prisma.price.deleteMany({
      where: {
        variantId: savedVariant.id,
        currency: { in: ["EUR", "USD"] }
      }
    });

    await prisma.price.create({
      data: {
        variantId: savedVariant.id,
        currency: "EUR",
        amountMinor: variant.eur,
        isActive: true
      }
    });

    await prisma.price.create({
      data: {
        variantId: savedVariant.id,
        currency: "USD",
        amountMinor: variant.usd,
        isActive: true
      }
    });
  }

  return { productId: product.id, variantIds: createdVariantIds };
}

async function seedShipping() {
  const countries = ["DE", "FR", "ES", "IT", "PL"];

  for (const countryCode of countries) {
    const zone = await prisma.shippingZone.upsert({
      where: { countryCode },
      update: {
        isActive: true,
        name: `EU-${countryCode}`
      },
      create: {
        countryCode,
        name: `EU-${countryCode}`,
        isActive: true
      }
    });

    await prisma.shippingRate.deleteMany({ where: { zoneId: zone.id } });

    await prisma.shippingRate.createMany({
      data: [
        {
          zoneId: zone.id,
          currency: "EUR",
          minOrderMinor: 0,
          maxOrderMinor: 9999,
          amountMinor: 700,
          estimatedDaysMin: 3,
          estimatedDaysMax: 7,
          isActive: true
        },
        {
          zoneId: zone.id,
          currency: "EUR",
          minOrderMinor: 10000,
          maxOrderMinor: 99999999,
          amountMinor: 0,
          estimatedDaysMin: 3,
          estimatedDaysMax: 7,
          isActive: true
        },
        {
          zoneId: zone.id,
          currency: "USD",
          minOrderMinor: 0,
          maxOrderMinor: 10999,
          amountMinor: 800,
          estimatedDaysMin: 3,
          estimatedDaysMax: 7,
          isActive: true
        },
        {
          zoneId: zone.id,
          currency: "USD",
          minOrderMinor: 11000,
          maxOrderMinor: 99999999,
          amountMinor: 0,
          estimatedDaysMin: 3,
          estimatedDaysMax: 7,
          isActive: true
        }
      ]
    });
  }
}

async function seedPromo() {
  await prisma.promoCode.upsert({
    where: { code: "WELCOME10" },
    update: {
      isActive: true,
      type: "PERCENT",
      value: 10,
      usageLimit: 10000
    },
    create: {
      code: "WELCOME10",
      type: "PERCENT",
      value: 10,
      isActive: true,
      usageLimit: 10000
    }
  });
}

async function seedAdmin() {
  const email = (process.env.ADMIN_SEED_EMAIL ?? "admin@drivenbyfaith.eu").toLowerCase();
  const password = process.env.ADMIN_SEED_PASSWORD ?? "ChangeMe123!";
  const hash = await bcrypt.hash(password, 12);

  const admin = await prisma.adminUser.upsert({
    where: { email },
    update: {
      isActive: true,
      role: "OWNER",
      passwordHash: hash
    },
    create: {
      email,
      role: "OWNER",
      passwordHash: hash,
      isActive: true
    }
  });

  return { email: admin.email, password };
}

async function main() {
  const { productId, variantIds } = await seedProductAndVariants();
  await seedShipping();
  await seedPromo();
  const admin = await seedAdmin();

  console.log("Seed completed");
  console.log("productId:", productId);
  console.log("variantIds:");
  for (const id of variantIds) {
    console.log("-", id);
  }
  console.log("promoCode:", "WELCOME10");
  console.log("adminEmail:", admin.email);
  console.log("adminPassword:", admin.password);
}

main()
  .catch((error) => {
    console.error("Seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
