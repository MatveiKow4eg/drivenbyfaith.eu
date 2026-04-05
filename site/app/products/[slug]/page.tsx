"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type ProductSection = { title: string; items: string[] };

type PublicVariant = {
  id: string;
  size: string;
  color: string;
  price: { currency: "EUR"; amountMinor: number };
  stock: number;
};

type PublicProduct = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  sectionsJson?: string | null;
  images: Array<{ path: string; alt: string | null; isMain: boolean }>;
  variants: PublicVariant[];
};

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

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.drivenbyfaith.eu/api/v1";
const API_ORIGIN = API_BASE.replace(/\/api\/v1\/?$/, "");
const CART_STORAGE_KEY = "dbf_cart_v1";

function resolveImageSrc(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/products/")) return path;
  if (path.startsWith("/")) return `${API_ORIGIN}${path}`;
  return `${API_ORIGIN}/${path}`;
}

function fmt(amountMinor: number) {
  return (amountMinor / 100).toFixed(2);
}

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

export default function ProductPage() {
  const params = useParams();
  const router = useRouter();
  const slug = typeof params.slug === "string" ? params.slug : Array.isArray(params.slug) ? params.slug[0] : "";

  const [product, setProduct] = useState<PublicProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [mainImageIndex, setMainImageIndex] = useState(0);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const sections: ProductSection[] = (() => {
    if (!product?.sectionsJson) return [];
    try { return JSON.parse(product.sectionsJson) as ProductSection[]; } catch { return []; }
  })();

  const selectedVariant = product?.variants.find((v) => v.id === selectedVariantId) ?? null;
  const cartCount = cartItems.reduce((sum, item) => sum + item.qty, 0);
  const cartSubtotalMinor = cartItems.reduce((sum, item) => sum + item.qty * item.unitPriceMinor, 0);

  useEffect(() => {
    setCartItems(readCart());
  }, []);

  useEffect(() => {
    if (!slug) return;
    fetch(`${API_BASE}/products/${slug}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); setLoading(false); return null; }
        return r.json();
      })
      .then((data: PublicProduct | null) => {
        if (!data) return;
        setProduct(data);
        const mainIdx = data.images.findIndex((img) => img.isMain);
        setMainImageIndex(mainIdx >= 0 ? mainIdx : 0);
        if (data.variants.length > 0) setSelectedVariantId(data.variants[0].id);
        setLoading(false);
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [slug]);

  const addToCart = () => {
    if (!product || !selectedVariant || selectedVariant.stock <= 0) return;

    const imagePath = (product.images.find((img) => img.isMain) ?? product.images[0])?.path ?? null;
    const current = readCart();
    const next = [...current];
    const index = next.findIndex((item) => item.variantId === selectedVariant.id);

    if (index >= 0) {
      next[index] = {
        ...next[index],
        qty: Math.min(20, next[index].qty + 1)
      };
    } else {
      next.push({
        variantId: selectedVariant.id,
        productId: product.id,
        slug: product.slug,
        name: product.name,
        size: selectedVariant.size,
        color: selectedVariant.color,
        unitPriceMinor: selectedVariant.price.amountMinor,
        qty: 1,
        imagePath
      });
    }

    writeCart(next);
    setCartItems(next);
    setCartOpen(true);
  };

  const updateCartQty = (variantId: string, qty: number) => {
    const next = cartItems
      .map((item) => (item.variantId === variantId ? { ...item, qty: Math.min(20, qty) } : item))
      .filter((item) => item.qty > 0);
    writeCart(next);
    setCartItems(next);
  };

  const removeFromCart = (variantId: string) => {
    const next = cartItems.filter((item) => item.variantId !== variantId);
    writeCart(next);
    setCartItems(next);
  };



  if (loading) {
    return (
      <main className="dbf-experience dbf-product-page">
        <p className="dbf-product-loading">Loading…</p>
      </main>
    );
  }

  if (notFound || !product) {
    return (
      <main className="dbf-experience dbf-product-page">
        <div className="dbf-product-not-found">
          <p>Product not found</p>
          <button onClick={() => router.push("/")} className="dbf-ghost-btn">
            ← Back
          </button>
        </div>
      </main>
    );
  }

  const mainImage = product.images[mainImageIndex] ?? product.images[0];
  const sizes = product.variants.map((v) => v.size).filter((s, i, a) => a.indexOf(s) === i);
  const colorsForSelectedSize = product.variants
    .filter((v) => !selectedVariant || v.size === selectedVariant.size)
    .map((v) => v.color)
    .filter((c, i, a) => a.indexOf(c) === i);

  const sceneGlow = selectedVariant?.color.toLowerCase().includes("black") ? "red" : "amber";

  return (
    <main className="dbf-experience dbf-product-page">
      {previewSrc ? (
        <div onClick={() => setPreviewSrc(null)} className="dbf-preview-overlay">
          <img src={previewSrc} alt="Preview" className="dbf-preview-image" />
        </div>
      ) : null}

      <button
        className="dbf-cart-toggle"
        onClick={() => setCartOpen(true)}
        aria-label={`Open cart (${cartCount} items)`}
      >
        <span className="dbf-cart-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 5H5L7.4 15.4C7.53 15.96 8.03 16.35 8.61 16.35H17.8C18.34 16.35 18.82 16 19 15.49L21 9.6C21.27 8.83 20.7 8.03 19.88 8.03H7.06" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="9.2" cy="19.2" r="1.6" fill="currentColor" />
            <circle cx="17.2" cy="19.2" r="1.6" fill="currentColor" />
          </svg>
        </span>
        <span className="dbf-cart-count" aria-hidden="true">{cartCount}</span>
      </button>

      <section className="hero" aria-label="Driven By Faith hero">
        <div className="hero-copy">
          <div className="hero-logo" aria-label="Driven By Faith logo">
            <span className="hero-logo-top">DRIVEN BY</span>
            <span className="hero-logo-btm">
              {"FAITH".split("").map((l, i) => <span key={i}>{l}</span>)}
            </span>
          </div>
          <nav className="hero-nav" aria-label="Main navigation">
            <a href="/#scents">Shop</a>
            <a href="/#scents">New</a>
            <a href="/#contact">Community</a>
            <a href="/#contact">Contact</a>
          </nav>
        </div>
      </section>

      <section id="product" className="product-selection" aria-label="Product details">
        <article className={`product-scene ${sceneGlow}`} aria-label={`${product.name} image`}>
          <div className="scene-bg-glow" aria-hidden="true" />
          <div className="product-visual" aria-hidden="true" onClick={() => mainImage && setPreviewSrc(resolveImageSrc(mainImage.path))}>
            {mainImage ? (
              <img src={resolveImageSrc(mainImage.path)} alt={mainImage.alt ?? product.name} className="product-img" />
            ) : (
              <div style={{ width: "100%", height: "100%", background: "#111" }} />
            )}
          </div>
        </article>

        <article className="product-scene amber" aria-label="Product controls" style={{ alignItems: "stretch" }}>
          <div className="dbf-product-control-card">
            <div className="dbf-product-control-head">
              <button onClick={() => router.back()} className="dbf-back-btn">← Back</button>
            </div>

            <h2 className="dbf-product-name">{product.name}</h2>

            {product.images.length > 1 ? (
              <div className="dbf-thumb-list">
                {product.images.map((img, idx) => (
                  <img
                    key={idx}
                    src={resolveImageSrc(img.path)}
                    alt={img.alt ?? ""}
                    onClick={() => setMainImageIndex(idx)}
                    className={`dbf-thumb ${idx === mainImageIndex ? "active" : ""}`}
                  />
                ))}
              </div>
            ) : null}

            <div className="dbf-product-selectors">
              <div>
                <div className="dbf-picker-head">
                  <p className="dbf-picker-label">Size</p>
                  {selectedVariant ? <p className="dbf-picker-price">{fmt(selectedVariant.price.amountMinor)} EUR</p> : null}
                </div>
                <div className="dbf-picker-row">
                  {sizes.map((size) => {
                    const variantForSize =
                      product.variants.find((v) => v.size === size && (!selectedVariant || v.color === selectedVariant.color)) ??
                      product.variants.find((v) => v.size === size);
                    const active = selectedVariant?.size === size;
                    const outOfStock = !variantForSize || variantForSize.stock === 0;
                    return (
                      <button
                        key={size}
                        disabled={outOfStock}
                        onClick={() => {
                          if (variantForSize) setSelectedVariantId(variantForSize.id);
                        }}
                        className={`dbf-pill-btn size ${active ? "active" : ""}`}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
              </div>

              {colorsForSelectedSize.length > 1 ? (
                <div>
                  <p className="dbf-picker-label">Color</p>
                  <div className="dbf-picker-row">
                    {colorsForSelectedSize.map((color) => {
                      const v = product.variants.find((x) => x.color === color && (!selectedVariant || x.size === selectedVariant.size));
                      const active = selectedVariant?.color === color;
                      return (
                        <button
                          key={color}
                          onClick={() => {
                            if (v) setSelectedVariantId(v.id);
                          }}
                          className={`dbf-pill-btn ${active ? "active" : ""}`}
                        >
                          {color}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            {product.description ? <p className="dbf-product-description">{product.description}</p> : null}

            <button className="dbf-add-btn" disabled={!selectedVariant || selectedVariant.stock <= 0} onClick={addToCart}>
              {!selectedVariant || selectedVariant.stock <= 0 ? "Out of stock" : "Add to cart"}
            </button>

            {sections.length > 0 ? (
              <div className="dbf-sections" id="product-sections">
                {sections.map((section, si) => (
                  <SectionAccordion key={si} section={section} defaultOpen={true} />
                ))}
              </div>
            ) : null}
          </div>
        </article>
      </section>

      <footer id="contact" className="art-footer">
        <p className="footer-brand">DRIVEN BY FAITH</p>
        <div className="footer-links">
          <a href="#" aria-label="Instagram">INSTAGRAM</a>
          <a href="#" aria-label="TikTok">TIKTOK</a>
          <a href="#" aria-label="Contact">CONTACT</a>
        </div>
      </footer>

      <aside className={`dbf-cart-drawer ${cartOpen ? "open" : ""}`} aria-label="Cart drawer">
        <div className="dbf-cart-head">
          <p>Cart</p>
          <button className="dbf-ghost-btn" onClick={() => setCartOpen(false)}>
            Close
          </button>
        </div>

        <div className="dbf-cart-items">
          {cartItems.length === 0 ? (
            <p className="dbf-cart-empty">Your cart is empty.</p>
          ) : (
            cartItems.map((item) => (
              <div key={item.variantId} className="dbf-cart-item">
                <div className="dbf-cart-item-top">
                  <p>{item.name}</p>
                </div>
                <p className="dbf-cart-item-meta">
                  {item.size} / {item.color}
                </p>
                <div className="dbf-cart-qty-row">
                  <button onClick={() => updateCartQty(item.variantId, item.qty - 1)}>-</button>
                  <span>{item.qty}</span>
                  <button onClick={() => updateCartQty(item.variantId, item.qty + 1)}>+</button>
                  <strong>{fmt(item.unitPriceMinor * item.qty)} EUR</strong>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="dbf-cart-checkout">
          <div className="dbf-subtotal-row">
            <span>Subtotal</span>
            <strong>{fmt(cartSubtotalMinor)} EUR</strong>
          </div>
          <button
            className="dbf-checkout-btn"
            disabled={cartItems.length === 0}
            onClick={() => { setCartOpen(false); router.push("/checkout"); }}
          >
            Proceed to checkout
          </button>
        </div>
      </aside>
      {cartOpen ? <div className="dbf-cart-overlay" onClick={() => setCartOpen(false)} /> : null}
    </main>
  );
}

function SectionAccordion({ section, defaultOpen }: { section: ProductSection; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  return (
    <div className="dbf-accordion">
      <button onClick={() => setOpen((v) => !v)} className="dbf-accordion-btn">
        <span>{section.title}</span>
        <span>{open ? "-" : "+"}</span>
      </button>
      {open ? (
        <ul className="dbf-accordion-list">
          {section.items
            .filter((item) => item.trim())
            .map((item, ii) => (
              <li key={ii}>{item}</li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}
