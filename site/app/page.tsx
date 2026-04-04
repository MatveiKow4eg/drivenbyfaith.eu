"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type ApiVariant = {
  price: { currency: string; amountMinor: number };
  stock: number;
};

type ApiProduct = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  images: Array<{ path: string; alt: string | null; isMain: boolean }>;
  variants: ApiVariant[];
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.drivenbyfaith.eu/api/v1";
const API_ORIGIN = API_BASE.replace(/\/api\/v1\/?$/, "");
const GLOWS: Array<"red" | "amber"> = ["red", "amber"];

function resolveImageSrc(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/products/")) return path;
  if (path.startsWith("/")) return `${API_ORIGIN}${path}`;
  return `${API_ORIGIN}/${path}`;
}

function getMinPrice(variants: ApiVariant[]): string | null {
  const eur = variants.filter((v) => v.price.currency === "EUR" && v.stock > 0);
  if (!eur.length) {
    const any = variants.filter((v) => v.price.currency === "EUR");
    if (!any.length) return null;
    return `€${(any[0].price.amountMinor / 100).toFixed(0)}`;
  }
  const min = Math.min(...eur.map((v) => v.price.amountMinor));
  return `€${(min / 100).toFixed(0)}`;
}

export default function Home() {
  const productsRef = useRef<HTMLElement>(null);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/products`)
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : (data?.products ?? data?.data ?? []);
        setProducts(list);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <main className="dbf-experience">

      <section className="hero" aria-label="Driven By Faith hero">
        <div className="hero-copy">
          <div className="hero-logo" aria-label="Driven By Faith logo">
            <span className="hero-logo-top">DRIVEN BY</span>
            <span className="hero-logo-btm">
              {"FAITH".split("").map((l, i) => <span key={i}>{l}</span>)}
            </span>
          </div>
          <nav className="hero-nav" aria-label="Main navigation">
            <a href="#scents">Shop</a>
            <a href="#scents">New</a>
            <a href="#contact">Community</a>
            <a href="#contact">Contact</a>
          </nav>
          <h1>Driven by faith</h1>
        </div>
      </section>

      <section id="scents" ref={productsRef} className="product-selection" aria-label="Select a scent">
        {loading ? (
          <p style={{ color: "#a3a3ad", gridColumn: "1/-1", textAlign: "center", padding: "60px 0" }}>Loading…</p>
        ) : products.length === 0 ? (
          <p style={{ color: "#a3a3ad", gridColumn: "1/-1", textAlign: "center", padding: "60px 0" }}>No products yet.</p>
        ) : products.map((product, idx) => {
          const mainImg = product.images.find((i) => i.isMain) ?? product.images[0];
          const price = getMinPrice(product.variants);
          const glow = GLOWS[idx % GLOWS.length];
          return (
            <Link
              key={product.id}
              href={`/products/${product.slug}`}
              style={{ textDecoration: "none" }}
            >
              <article
                className={`product-scene ${glow}`}
                aria-label={`${product.name} fragrance`}
                style={{ cursor: "pointer" }}
              >
                <div className="scene-bg-glow" aria-hidden="true" />
                <div className="product-visual" aria-hidden="true">
                  {mainImg ? (
                    <img src={resolveImageSrc(mainImg.path)} alt={mainImg.alt ?? product.name} className="product-img" />
                  ) : (
                    <div style={{ width: "100%", height: "100%", background: "#111" }} />
                  )}
                </div>
                <div className="scene-card-info">
                  <p className="scene-mini-title">{product.name}</p>
                  {price ? <p className="scene-mini-price">{price}</p> : null}
                </div>
              </article>
            </Link>
          );
        })}
      </section>

      <footer id="contact" className="art-footer">
        <p className="footer-brand">DRIVEN BY FAITH</p>
        <div className="footer-links">
          <a href="#" aria-label="Instagram">INSTAGRAM</a>
          <a href="#" aria-label="TikTok">TIKTOK</a>
          <a href="#" aria-label="Contact">CONTACT</a>
        </div>
      </footer>

    </main>
  );
}
