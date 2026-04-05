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

export default function CheckoutPage() {
  const router = useRouter();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState("");

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [matchedAddress, setMatchedAddress] = useState("");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [district, setDistrict] = useState("");
  const [county, setCounty] = useState("");
  const [region, setRegion] = useState("");
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
    setMatchedAddress(value);
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
    ]
      .filter(Boolean)
      .join(", ");

    setMatchedAddress(item.display_name);
    setLine1(compactLine1);
    setCity(resolvedCity);
    setPostalCode(a.postcode ?? "");
    setDistrict(resolvedDistrict);
    setCounty(resolvedCounty);
    setRegion(resolvedRegion);
    setCountryCode(resolvedCountry);
    setCountryName(COUNTRY_NAMES[resolvedCountry] ?? resolvedCountry);
    setSuggestionsOpen(false);
    setSuggestions([]);
    if (resolvedCountry) triggerQuote(resolvedCountry);
  };

  const handleSubmit = async () => {
    if (cartItems.length === 0 || loading || !countryCode) return;
    setError(null);
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/checkout/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        
        body: JSON.stringify({
          countryCode: countryCode.toUpperCase(),
          promoCode: promoCode.trim() || undefined,
          items: cartItems.map((item) => ({ variantId: item.variantId, qty: item.qty })),
          customer: {
            email: email.trim(),
            fullName: fullName.trim(),
            address: {
              line1: line1.trim(),
              line2: [line2.trim(), district.trim(), county.trim(), region.trim()].filter(Boolean).join(", ") || undefined,
              city: city.trim(),
              postalCode: postalCode.trim(),
              countryCode: countryCode.toUpperCase(),
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
                <input
                  placeholder="Address from search (auto)"
                  value={matchedAddress}
                  onChange={(e) => setMatchedAddress(e.target.value)}
                />
                <div className="dbf-autocomplete-wrap">
                  <input
                    placeholder="Start typing your address…"
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
                  placeholder="Apartment, suite… (optional)"
                  value={line2}
                  onChange={(e) => setLine2(e.target.value)}
                />
                <input
                  placeholder="District / Area"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
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
                  placeholder="County"
                  value={county}
                  onChange={(e) => setCounty(e.target.value)}
                />
                <input
                  placeholder="Region / State"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                />
                {countryCode && (
                  <div className="dbf-country-badge">
                    <span className="dbf-country-flag">{countryCode}</span>
                    <span>{countryName || countryCode}</span>
                    <button
                      className="dbf-country-clear"
                      onClick={() => {
                        setCountryCode("");
                        setCountryName("");
                        setDistrict("");
                        setCounty("");
                        setRegion("");
                        setQuote(null);
                      }}
                      type="button"
                    >×</button>
                  </div>
                )}
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
