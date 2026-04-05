"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

type NominatimResult = {
  place_id: number;
  display_name: string;
  address: {
    road?: string;
    house_number?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    suburb?: string;
    neighbourhood?: string;
    city_district?: string;
    county?: string;
    state?: string;
    state_district?: string;
    postcode?: string;
    country_code?: string;
  };
};

type QuoteResult = {
  shippingMinor: number;
  totalMinor: number;
  subtotalMinor: number;
  shippingEstimateDays: { min: number; max: number };
  currency: string;
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

function extractPostalCode(text: string): string {
  const match = text.match(/\b[0-9]{3,10}(?:-[0-9]{3,10})?\b/);
  return match ? match[0] : "";
}

export default function CheckoutPage() {
  const router = useRouter();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState("");

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [line1, setLine1] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [regionName, setRegionName] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [countryName, setCountryName] = useState("");

  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quoteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setCartItems(readCart());
  }, []);

  const subtotal = cartItems.reduce((sum, item) => sum + item.qty * item.unitPriceMinor, 0);

  const fetchQuote = useCallback(async (country: string) => {
    if (!country || cartItems.length === 0) return;
    setQuoteLoading(true);
    setQuoteError(null);
    try {
      const resp = await fetch(`${API_BASE}/checkout/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          countryCode: country.toUpperCase(),
          items: cartItems.map((i) => ({ variantId: i.variantId, qty: i.qty })),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.message ?? "Could not get shipping quote");
      setQuote(data);
    } catch (e) {
      setQuoteError(e instanceof Error ? e.message : "Shipping unavailable");
      setQuote(null);
    } finally {
      setQuoteLoading(false);
    }
  }, [cartItems]);

  const triggerQuote = useCallback((country: string) => {
    if (quoteDebounceRef.current) clearTimeout(quoteDebounceRef.current);
    quoteDebounceRef.current = setTimeout(() => fetchQuote(country), 500);
  }, [fetchQuote]);

  const searchAddress = (value: string) => {
    setLine1(value);
    setSuggestions([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 4) return;
    debounceRef.current = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(value)}&format=json&addressdetails=1&limit=5`;
        const resp = await fetch(url, { headers: { "Accept-Language": "en" } });
        const data: NominatimResult[] = await resp.json();
        setSuggestions(data);
        setSuggestionsOpen(true);
      } catch { /* ignore */ }
    }, 600);
  };

  const pickSuggestion = (item: NominatimResult) => {
    const a = item.address;
    const road = [a.road, a.house_number].filter(Boolean).join(" ");
    const resolvedCity = a.city ?? a.town ?? a.village ?? a.municipality ?? "";
    const resolvedDistrict = a.suburb ?? a.neighbourhood ?? a.city_district ?? "";
    const resolvedCounty = a.county ?? "";
    const resolvedRegion = a.state ?? a.state_district ?? "";
    const resolvedCountry = (a.country_code ?? "").toUpperCase();
    const COUNTRY_NAMES: Record<string, string> = {
      DE: "Germany", FR: "France", ES: "Spain", IT: "Italy", PL: "Poland",
      NL: "Netherlands", BE: "Belgium", AT: "Austria", CH: "Switzerland",
      SE: "Sweden", NO: "Norway", DK: "Denmark", FI: "Finland", PT: "Portugal",
      CZ: "Czech Republic", SK: "Slovakia", HU: "Hungary", RO: "Romania",
      BG: "Bulgaria", HR: "Croatia", SI: "Slovenia", EE: "Estonia",
      LV: "Latvia", LT: "Lithuania", LU: "Luxembourg", IE: "Ireland",
      GR: "Greece", CY: "Cyprus", MT: "Malta", GB: "United Kingdom",
      US: "United States", CA: "Canada", AU: "Australia",
    };
    const compactLine1 = [
      road || item.display_name.split(",")[0],
      resolvedDistrict,
      [a.postcode, resolvedCounty].filter(Boolean).join(" "),
      resolvedRegion,
    ].filter(Boolean).join(", ");

    const parsedPostal = extractPostalCode(item.display_name);
    const fallbackCity = resolvedCounty || resolvedRegion;

    setLine1(item.display_name || compactLine1);
    setCity(resolvedCity || fallbackCity);
    setPostalCode(a.postcode ?? parsedPostal);
    setRegionName([resolvedRegion, resolvedCounty].filter(Boolean).join(", "));
    setCountryCode(resolvedCountry);
    setCountryName(COUNTRY_NAMES[resolvedCountry] ?? resolvedCountry);
    setSuggestionsOpen(false);
    setSuggestions([]);
    if (resolvedCountry) triggerQuote(resolvedCountry);
  };

  const handleSubmit = async () => {
    if (cartItems.length === 0 || loading || !countryCode) return;

    const safeAddress = line1.trim();
    const safeCity = city.trim();
    const safePostal = postalCode.trim();
    const safeCountry = countryCode.trim().toUpperCase();

    if (!safeAddress) {
      setError("Address is required");
      return;
    }

    if (!safeCity) {
      setError("City is required");
      return;
    }

    if (!safePostal) {
      setError("Postal code is required");
      return;
    }

    if (!safeCountry) {
      setError("Country is required");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/checkout/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        
        body: JSON.stringify({
          countryCode: safeCountry,
          promoCode: promoCode.trim() || undefined,
          items: cartItems.map((item) => ({ variantId: item.variantId, qty: item.qty })),
          customer: {
            email: email.trim(),
            fullName: fullName.trim(),
            address: {
              line1: safeAddress,
              line2: regionName.trim() || undefined,
              city: safeCity,
              postalCode: safePostal,
              countryCode: safeCountry,
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
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <input
                  placeholder="Full Name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
                <div className="dbf-autocomplete-wrap">
                  <input
                    placeholder="Address"
                    value={line1}
                    autoComplete="off"
                    onChange={(e) => searchAddress(e.target.value)}
                    onFocus={() => suggestions.length > 0 && setSuggestionsOpen(true)}
                    onBlur={() => setTimeout(() => setSuggestionsOpen(false), 180)}
                  />
                  {suggestionsOpen && suggestions.length > 0 && (
                    <ul className="dbf-autocomplete-list">
                      {suggestions.map((s) => (
                        <li key={s.place_id} onMouseDown={() => pickSuggestion(s)}>
                          {s.display_name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <input
                  placeholder="Region / State / County"
                  value={regionName}
                  onChange={(e) => setRegionName(e.target.value)}
                />
                <input
                  placeholder="City"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
                <input
                  placeholder="Postal Code"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                />
                <input
                  placeholder="Country code (2 letters, e.g. DE)"
                  value={countryCode}
                  maxLength={2}
                  onChange={(e) => {
                    const next = e.target.value.toUpperCase();
                    setCountryCode(next);
                    if (next.length === 2) {
                      triggerQuote(next);
                    } else {
                      setQuote(null);
                    }
                  }}
                />
                <input
                  placeholder="Country"
                  value={countryName}
                  onChange={(e) => setCountryName(e.target.value)}
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
              {quoteLoading && <p className="dbf-quote-loading">Calculating shipping…</p>}
              {quote && !quoteLoading && (
                <>
                  <div className="dbf-subtotal-row">
                    <span>
                      Shipping
                      {quote.shippingEstimateDays
                        ? ` (${quote.shippingEstimateDays.min}–${quote.shippingEstimateDays.max} days)`
                        : ""}
                    </span>
                    <strong>{quote.shippingMinor === 0 ? "Free" : `${fmt(quote.shippingMinor)} EUR`}</strong>
                  </div>
                  <div className="dbf-subtotal-row dbf-total-row">
                    <span>Total</span>
                    <strong>{fmt(quote.totalMinor)} EUR</strong>
                  </div>
                </>
              )}
              {quoteError && <p className="dbf-checkout-error">{quoteError}</p>}

              {error ? <p className="dbf-checkout-error">{error}</p> : null}

              <button
                className="dbf-checkout-btn"
                disabled={loading || !countryCode}
                onClick={handleSubmit}
              >
                {loading ? "Creating session…" : !countryCode ? "Enter your address first" : "Proceed to payment"}
              </button>
            </section>

          </div>
        )}
      </div>
    </main>
  );
}
