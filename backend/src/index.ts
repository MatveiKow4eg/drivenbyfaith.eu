import cors from "cors";
import express from "express";
import type { Request, Response } from "express";
import { env } from "./config.js";
import { adminRouter } from "./modules/admin.routes.js";
import { checkoutRouter } from "./modules/checkout.routes.js";
import { productsRouter } from "./modules/products.routes.js";
import { stripeWebhookRouter } from "./modules/stripe.webhook.routes.js";

const app = express();

app.use(cors({ origin: env.FRONTEND_URL }));
app.use("/api/v1/webhooks/stripe", express.raw({ type: "application/json" }), stripeWebhookRouter);
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", service: "backend", timestamp: new Date().toISOString() });
});

app.get("/api/v1/meta", (_req: Request, res: Response) => {
  res.status(200).json({
    currency: ["EUR", "USD"],
    checkoutMode: "guest",
    pricingSource: "database"
  });
});

app.use("/api/v1", productsRouter);
app.use("/api/v1", checkoutRouter);
app.use("/api/v1", adminRouter);

app.use((err: unknown, _req: Request, res: Response, _next: unknown) => {
  console.error("Unhandled error", err);
  res.status(500).json({ message: "Internal server error" });
});

app.listen(env.PORT, () => {
  console.log(`Backend listening on port ${env.PORT}`);
});
