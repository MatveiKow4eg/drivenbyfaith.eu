"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type CartItem = {
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  size: string;
  color: string;
  unitPriceMinor: number;
  qty: number;
  imagePath: string | null;
};

type CheckoutCustomer = {
  email: string;
  fullName: string;
  line1: string;
  line2: string;
  city: string;
  postalCode: string;
  countryCode: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.drivenbyfaith.eu/api/v1";
const API_ORIGIN = API_BASE.replace(/\/api\/v1\/?$/, "");
const CART_STORAGE_KEY = "dbf_cart_v1";

function readCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCart(items: CartItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
}

function fmt(amountMinor: number) {
  return (amountMinor / 100).toFixed(2);
}

function resolveImageSrc(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/products/")) return path;
  if (path.startsWith("/")) return `${API_ORIGIN}${path}`;
  return `${API_ORIGIN}/${path}`;
}

export default function CheckoutPage() {
  const router = useRouter();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [customer, setCustomer] = useState<CheckoutCustomer>({
    email: "",
    fullName: "",
    line1: "",
    line2: "",
    city: "",
    postalCode: "",
    countryCode: "DE",
  });

  useEffect(() => {
    setCartItems(readCart());
  }, []);

  const subtotal = cartItems.reduce((sum, item) => sum + item.qty * item.unitPriceMinor, 0);

  const handleSubmit = async () => {
    if (cartItems.length === 0 || loading) return;
    setError(null);
    setLoading(true);
    try {
      const countryCode = customer.countryCode.trim().toUpperCase() || "DE";
      const response = await fetch(`${API_BASE}/checkout/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          countryCode,
          promoCode: promoCode.trim() || undefined,
          items: cartItems.map((item) => ({ variantId: item.variantId, qty: item.qty })),
          customer: {
            email: customer.email.trim(),
            fullName: customer.fullName.trim(),
            address: {
              line1: customer.line1.trim(),
              line2: customer.line2.trim() || undefined,
              city: customer.city.trim(),
              postalCode: customer.postalCode.trim(),
              countryCode,
            },
          },
          successUrl: `${window.location.origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/checkout`,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? "Checkout failed");
      if (typeof data?.checkoutUrl === "string" && data.checkoutUrl) {
        writeCart([]);
        window.location.href = data.checkoutUrl;
        return;
      }
      throw new Error("Checkout URL missing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setLoading(false);
    }
  };

  return (
    <main className="dbf-experience dbf-checkout-page">
      <div className="dbf-checkout-shell">
        <button onClick={() => router.back()} className="dbf-back-btn">
          ← Back
        </button>

        <h1 className="dbf-checkout-title">Checkout</h1>

        {cartItems.length === 0 ? (
          <p className="dbf-cart-empty">Your cart is empty.</p>
        ) : (
          <div className="dbf-checkout-grid">

            <section className="dbf-checkout-form-wrap">
              <h2 className="dbf-checkout-section-head">Delivery details</h2>
              <div className="dbf-form-grid">
                <input
                  placeholder="Email"
                  type="email"
                  value={customer.email}
                  onChange={(e) => setCustomer((p) => ({ ...p, email: e.target.value }))}
                />
                <input
                  placeholder="Full Name"
                  value={customer.fullName}
                  onChange={(e) => setCustomer((p) => ({ ...p, fullName: e.target.value }))}
                />
                <input
                  placeholder="Address Line 1"
                  value={customer.line1}
                  onChange={(e) => setCustomer((p) => ({ ...p, line1: e.target.value }))}
                />
                <input
                  placeholder="Address Line 2 (optional)"
                  value={customer.line2}
                  onChange={(e) => setCustomer((p) => ({ ...p, line2: e.target.value }))}
                />
                <input
                  placeholder="City"
                  value={customer.city}
                  onChange={(e) => setCustomer((p) => ({ ...p, city: e.target.value }))}
                />
                <input
                  placeholder="Postal Code"
                  value={customer.postalCode}
                  onChange={(e) => setCustomer((p) => ({ ...p, postalCode: e.target.value }))}
                />
                <input
                  placeholder="Country (2 letters, e.g. DE)"
                  maxLength={2}
                  value={customer.countryCode}
                  onChange={(e) => setCustomer((p) => ({ ...p, countryCode: e.target.value.toUpperCase() }))}
                />
                <input
                  placeholder="Promo code (optional)"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                />
              </div>
            </section>

            <section className="dbf-checkout-summary">
              <h2 className="dbf-checkout-section-head">Order summary</h2>
              <div className="dbf-checkout-items">
                {cartItems.map((item) => (
                  <div key={item.variantId} className="dbf-checkout-item">
                    {item.imagePath ? (
                      <img
                        src={resolveImageSrc(item.imagePath)}
                        alt={item.name}
                        className="dbf-checkout-item-img"
                      />
                    ) : null}
                    <div className="dbf-checkout-item-info">
                      <p>{item.name}</p>
                      <p className="dbf-cart-item-meta">
                        {item.size} / {item.color} × {item.qty}
                      </p>
                    </div>
                    <strong>{fmt(item.unitPriceMinor * item.qty)} EUR</strong>
                  </div>
                ))}
              </div>
              <div className="dbf-subtotal-row">
                <span>Subtotal</span>
                <strong>{fmt(subtotal)} EUR</strong>
              </div>

              {error ? <p className="dbf-checkout-error">{error}</p> : null}

              <button
                className="dbf-checkout-btn"
                disabled={loading}
                onClick={handleSubmit}
              >
                {loading ? "Creating session…" : "Proceed to payment"}
              </button>
            </section>

          </div>
        )}
      </div>
    </main>
  );
}
