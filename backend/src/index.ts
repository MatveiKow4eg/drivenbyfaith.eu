import cors from "cors";
import express from "express";
import type { Request, Response } from "express";
import { env } from "./config.js";

const app = express();

app.use(cors({ origin: env.FRONTEND_URL }));
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

app.listen(env.PORT, () => {
  console.log(`Backend listening on port ${env.PORT}`);
});
