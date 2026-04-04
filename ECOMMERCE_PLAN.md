# E-commerce Plan (T-Shirts) - MVP -> Production

## 1) Confirmed Scope

- Product type: T-shirts.
- Geography: mainly Europe (expand later).
- Payments: Stripe + Apple Pay + Google Pay.
- Shipping: depends on destination country and order amount.
- Product variants: sizes `S-XXXL` and multiple colors (managed via DB).
- Auth: no customer registration required (guest checkout only).
- Admin panel MVP: products, prices, photos (stored locally, referenced via DB), inventory, orders, promo codes.
- Currencies: EUR and USD.
- Taxes: out of scope for MVP (no automated tax calculation yet).
- Deployment target:
  - Frontend: Vercel.
  - Backend: separate `backend/` folder, deployed to Vultr.
  - CI/CD: auto-deploy from GitHub to Vultr.

## 2) Target Architecture

- Monorepo structure:
  - `site/` - Next.js storefront (public website).
  - `backend/` - API server (Node.js/TypeScript) for business logic, Stripe webhooks, admin API, DB access.
- Database: PostgreSQL (single source of truth for all prices and inventory).
- ORM: Prisma.
- Payments: Stripe Checkout Session + webhooks.
- Media:
  - Upload photos to backend storage path (local disk on Vultr for MVP).
  - Store image metadata/path in DB.
- Communication:
  - `site/` calls `backend/` REST API.
  - `backend/` creates Stripe sessions and validates all line items from DB only.

## 3) Folder Plan

- `site/` (already exists)
- `backend/` (new)
  - `src/modules/auth` (admin auth only)
  - `src/modules/products`
  - `src/modules/pricing`
  - `src/modules/inventory`
  - `src/modules/orders`
  - `src/modules/promocodes`
  - `src/modules/shipping`
  - `src/modules/stripe`
  - `src/modules/uploads`
  - `src/modules/admin`
  - `prisma/schema.prisma`
  - `scripts/` (deployment, seed, migrations helper)

## 4) Database Design (Prices from DB only)

Core entities:

- `Product`
  - `id`, `slug`, `name`, `description`, `isActive`, `createdAt`, `updatedAt`
- `ProductImage`
  - `id`, `productId`, `path`, `alt`, `sortOrder`, `isMain`
- `ProductVariant`
  - `id`, `productId`, `size` (`S`..`XXXL`), `color`, `sku`, `isActive`
- `Price`
  - `id`, `variantId`, `currency` (`EUR`,`USD`), `amountMinor` (int, cents), `isActive`, `validFrom`, `validTo`
- `Inventory`
  - `id`, `variantId`, `quantity`, `reservedQuantity`, `updatedAt`
- `PromoCode`
  - `id`, `code`, `type` (`PERCENT`,`FIXED`), `value`, `currency?`, `minOrderAmountMinor?`, `maxDiscountMinor?`, `startsAt`, `endsAt`, `usageLimit`, `usedCount`, `isActive`
- `ShippingZone`
  - `id`, `name`, `countryCode` (ISO), `isActive`
- `ShippingRate`
  - `id`, `zoneId`, `currency`, `minOrderMinor`, `maxOrderMinor`, `amountMinor`, `estimatedDaysMin`, `estimatedDaysMax`, `isActive`
- `Order`
  - `id`, `orderNumber`, `status`, `currency`, `subtotalMinor`, `discountMinor`, `shippingMinor`, `totalMinor`, `email`, `fullName`, `addressJson`, `countryCode`, `promoCodeId?`, `stripePaymentIntentId?`, `stripeCheckoutSessionId?`, `createdAt`
- `OrderItem`
  - `id`, `orderId`, `productId`, `variantId`, `sku`, `nameSnapshot`, `sizeSnapshot`, `colorSnapshot`, `unitPriceMinor`, `qty`, `lineTotalMinor`
- `AdminUser`
  - `id`, `email`, `passwordHash`, `role`, `isActive`, `lastLoginAt`
- `AuditLog`
  - `id`, `adminUserId`, `action`, `entityType`, `entityId`, `diffJson`, `createdAt`

Critical pricing rule:

- Frontend never sends final prices as source of truth.
- Backend computes cart pricing by loading active `Price` rows for each variant/currency.
- Stripe line items are generated server-side from DB values only.

## 5) Checkout and Stripe Flow

1. Customer adds variants to cart.
2. Frontend calls backend `POST /checkout/quote` with variant IDs, quantities, country, currency, promo code.
3. Backend validates:
   - Variant exists and active.
   - Price exists in requested currency.
   - Stock available.
   - Promo code validity.
   - Shipping rule by country + order amount.
4. Backend returns computed quote.
5. Frontend calls `POST /checkout/session` with quote token/id.
6. Backend re-validates all items from DB and creates Stripe Checkout Session.
7. Customer pays in Stripe (Apple Pay / Google Pay available in Stripe Checkout where supported).
8. Stripe webhook (`checkout.session.completed` / payment events):
   - Create final order.
   - Deduct inventory.
   - Mark promo usage.
   - Send confirmation email.

## 6) Admin Panel MVP

Required screens:

- Admin login.
- Products list/create/edit.
- Variant matrix per product (size x color).
- Multi-currency pricing editor (EUR, USD).
- Inventory editor per variant.
- Image uploader (local storage path + DB records).
- Orders list/detail/status update.
- Promo code CRUD.

Security baseline:

- Admin-only JWT/session auth.
- Rate limit on auth and checkout endpoints.
- Input validation with Zod.
- CSRF protection where needed.
- Webhook signature verification for Stripe.

## 7) Shipping Logic MVP

- Table-driven shipping rates by:
  - Country (via shipping zone).
  - Order amount range.
  - Currency.
- Example approach:
  - `ShippingZone`: DE, FR, IT, ES, etc.
  - `ShippingRate`: for each zone + min/max basket threshold.
- Free shipping can be represented as `amountMinor = 0` for threshold rows.

## 8) API Contract (Initial)

Public:

- `GET /products`
- `GET /products/:slug`
- `POST /checkout/quote`
- `POST /checkout/session`
- `POST /webhooks/stripe`

Admin:

- `POST /admin/auth/login`
- `GET/POST/PATCH/DELETE /admin/products`
- `GET/POST/PATCH/DELETE /admin/variants`
- `GET/POST/PATCH/DELETE /admin/prices`
- `GET/POST/PATCH /admin/inventory`
- `GET/POST/PATCH /admin/orders`
- `GET/POST/PATCH/DELETE /admin/promocodes`
- `POST /admin/uploads`

## 9) Delivery Plan (Phases)

### Phase 0 - Foundation (1-2 days)

- Create `backend/` project structure.
- Setup TypeScript, linter, environment config.
- Connect PostgreSQL + Prisma.
- Define schema + run first migration.
- Seed sample t-shirts, variants, and prices.

### Phase 1 - Catalog + Cart Pricing (2-4 days)

- Product/variant APIs.
- Frontend product listing and PDP integration.
- Cart state in frontend.
- `checkout/quote` endpoint with DB pricing and shipping logic.

### Phase 2 - Stripe Checkout (2-3 days)

- Create Stripe Checkout Session server-side from DB quote.
- Webhook endpoint with signature verification.
- Order creation and inventory deduction.
- Success/cancel pages.

### Phase 3 - Admin MVP (3-5 days)

- Admin auth.
- Product/variant/price CRUD.
- Inventory management.
- Order management.
- Promo code management.
- Image upload + DB references.

### Phase 4 - Hardening + QA (2-4 days)

- Validation, error handling, edge cases.
- Audit logs for admin actions.
- Basic tests for pricing/checkout/webhook.
- Monitoring and backups.

## 10) CI/CD and Deploy Strategy

### Frontend (`site/` -> Vercel)

- Connect GitHub repo to Vercel.
- Auto-deploy on push to `main` (or `production` branch).
- Set env vars in Vercel dashboard for backend API URL and public keys.

### Backend (`backend/` -> Vultr)

Target options:

- Vultr VM + Docker Compose (recommended for control).
- Backend container + PostgreSQL (or managed PostgreSQL).

GitHub Actions pipeline:

- Trigger: push to `main` when `backend/**` changes.
- Steps:
  - Install deps.
  - Run typecheck + tests.
  - Build backend Docker image.
  - Push image to registry (GHCR or Docker Hub).
  - SSH to Vultr server.
  - Pull latest image.
  - Run migrations.
  - Restart service (`docker compose up -d`).

Deployment script (on Vultr) should:

- Pull latest image.
- Apply Prisma migrations safely.
- Restart API.
- Keep previous image for quick rollback.

## 11) Environment Variables (Draft)

Backend:

- `DATABASE_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PUBLISHABLE_KEY`
- `APP_BASE_URL`
- `FRONTEND_URL`
- `JWT_SECRET`
- `UPLOAD_DIR`

Frontend:

- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

## 12) Acceptance Criteria for MVP

- Customer can buy a t-shirt variant (size + color) in EUR or USD.
- Checkout uses Stripe with Apple Pay/Google Pay support.
- All final prices come from DB via backend; frontend prices are display-only.
- Shipping cost is calculated by country + order amount.
- Admin can CRUD products, variants, prices, stock, promo codes, and process orders.
- Product images are stored locally on backend host and rendered via DB paths.
- Frontend auto-deploys to Vercel; backend auto-deploys to Vultr from GitHub.

## 13) Open Decisions (Finalize Before Build)

- Full list of initial EU countries and shipping price matrix.
- Promo code stacking rules (one code vs multiple).
- Refund/cancel policy workflow in admin.
- Whether to reserve stock at quote/session creation or only after successful payment.
- Whether backend should be one service or split API + worker for async jobs.

## 14) Recommended Next Step

- Approve this plan, then start implementation with:
  1. `backend/` bootstrap + Prisma schema.
  2. `checkout/quote` logic (DB prices + shipping + promo).
  3. Stripe checkout + webhook.
  4. Admin MVP.
