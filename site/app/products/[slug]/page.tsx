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

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.drivenbyfaith.eu/api/v1";
const API_ORIGIN = API_BASE.replace(/\/api\/v1\/?$/, "");

function resolveImageSrc(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/products/")) return path;
  if (path.startsWith("/")) return `${API_ORIGIN}${path}`;
  return `${API_ORIGIN}/${path}`;
}

function fmt(amountMinor: number) {
  return (amountMinor / 100).toFixed(2);
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

  const sections: ProductSection[] = (() => {
    if (!product?.sectionsJson) return [];
    try { return JSON.parse(product.sectionsJson) as ProductSection[]; } catch { return []; }
  })();

  const selectedVariant = product?.variants.find((v) => v.id === selectedVariantId) ?? null;

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

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", background: "#040404", display: "grid", placeItems: "center" }}>
        <p style={{ color: "#a3a3ad", fontFamily: "var(--font-body)" }}>Loading…</p>
      </main>
    );
  }

  if (notFound || !product) {
    return (
      <main style={{ minHeight: "100vh", background: "#040404", display: "grid", placeItems: "center", fontFamily: "var(--font-body)" }}>
        <div style={{ textAlign: "center", color: "#f7f2e9" }}>
          <p style={{ fontSize: 22, marginBottom: 16 }}>Product not found</p>
          <button onClick={() => router.push("/")} style={{ color: "#a3a3ad", background: "none", border: "1px solid #333", borderRadius: 8, padding: "10px 20px", cursor: "pointer" }}>
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

  return (
    <main style={{ minHeight: "100vh", background: "#040404", color: "#f7f2e9", fontFamily: "var(--font-body)" }}>

      {previewSrc ? (
        <div onClick={() => setPreviewSrc(null)} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.92)", display: "grid", placeItems: "center", cursor: "zoom-out" }}>
          <img src={previewSrc} alt="Preview" style={{ maxWidth: "92vw", maxHeight: "92vh", objectFit: "contain", borderRadius: 12 }} />
        </div>
      ) : null}

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px" }}>
        <button onClick={() => router.back()} style={{ color: "#a3a3ad", background: "none", border: "none", cursor: "pointer", fontSize: 14, marginBottom: 28, display: "flex", alignItems: "center", gap: 6 }}>
          ← Back
        </button>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 48, alignItems: "start" }}>

          {/* ── Left: Images ── */}
          <div>
            {mainImage ? (
              <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", background: "#0f0f10", cursor: "zoom-in" }} onClick={() => setPreviewSrc(resolveImageSrc(mainImage.path))}>
                <img
                  src={resolveImageSrc(mainImage.path)}
                  alt={mainImage.alt ?? product.name}
                  style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", display: "block" }}
                />
              </div>
            ) : (
              <div style={{ width: "100%", aspectRatio: "1 / 1", background: "#0f0f10", borderRadius: 16, display: "grid", placeItems: "center", color: "#555" }}>No image</div>
            )}
            {product.images.length > 1 ? (
              <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                {product.images.map((img, idx) => (
                  <img
                    key={idx}
                    src={resolveImageSrc(img.path)}
                    alt={img.alt ?? ""}
                    onClick={() => setMainImageIndex(idx)}
                    style={{
                      width: 70, height: 70, objectFit: "cover", borderRadius: 8, cursor: "pointer",
                      border: `2px solid ${idx === mainImageIndex ? "#fff" : "#252529"}`
                    }}
                  />
                ))}
              </div>
            ) : null}
          </div>

          {/* ── Right: Info + Buy ── */}
          <div style={{ display: "grid", gap: 20 }}>
            <div>
              <h1 style={{ fontFamily: "var(--font-headline)", fontSize: 42, letterSpacing: 1, marginBottom: 6, lineHeight: 1.1 }}>{product.name}</h1>
              {product.description ? (
                <p style={{ color: "#a3a3ad", fontSize: 15, lineHeight: 1.7 }}>{product.description}</p>
              ) : null}
            </div>

            {selectedVariant ? (
              <div style={{ fontSize: 30, fontFamily: "var(--font-headline)", letterSpacing: 0.5 }}>
                {fmt(selectedVariant.price.amountMinor)} EUR
              </div>
            ) : null}

            {/* Size picker */}
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.4, color: "#a3a3ad", textTransform: "uppercase", marginBottom: 10 }}>Size</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {sizes.map((size) => {
                  const variantForSize = product.variants.find((v) => v.size === size && (!selectedVariant || v.color === selectedVariant.color)) ?? product.variants.find((v) => v.size === size);
                  const active = selectedVariant?.size === size;
                  const outOfStock = !variantForSize || variantForSize.stock === 0;
                  return (
                    <button
                      key={size}
                      disabled={outOfStock}
                      onClick={() => { if (variantForSize) setSelectedVariantId(variantForSize.id); }}
                      style={{
                        width: 48, height: 48, borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: outOfStock ? "not-allowed" : "pointer",
                        background: active ? "#fff" : "transparent",
                        color: active ? "#040404" : outOfStock ? "#444" : "#f7f2e9",
                        border: `2px solid ${active ? "#fff" : outOfStock ? "#333" : "#555"}`,
                        opacity: outOfStock ? 0.45 : 1
                      }}
                    >
                      {size}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Color picker */}
            {colorsForSelectedSize.length > 1 ? (
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.4, color: "#a3a3ad", textTransform: "uppercase", marginBottom: 10 }}>Color</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {colorsForSelectedSize.map((color) => {
                    const v = product.variants.find((x) => x.color === color && (!selectedVariant || x.size === selectedVariant.size));
                    const active = selectedVariant?.color === color;
                    return (
                      <button
                        key={color}
                        onClick={() => { if (v) setSelectedVariantId(v.id); }}
                        style={{
                          padding: "8px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer",
                          background: active ? "#fff" : "transparent",
                          color: active ? "#040404" : "#f7f2e9",
                          border: `2px solid ${active ? "#fff" : "#555"}`
                        }}
                      >
                        {color}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {selectedVariant ? (
              <p style={{ fontSize: 13, color: selectedVariant.stock > 0 ? "#17803d" : "#c33131" }}>
                {selectedVariant.stock > 0 ? `${selectedVariant.stock} in stock` : "Out of stock"}
              </p>
            ) : null}

            <a
              href={selectedVariant && selectedVariant.stock > 0 ? `/?variantId=${selectedVariant.id}&slug=${product.slug}` : undefined}
              style={{
                display: "block", textAlign: "center", padding: "16px 0",
                background: selectedVariant && selectedVariant.stock > 0 ? "#fff" : "#1a1a1a",
                color: selectedVariant && selectedVariant.stock > 0 ? "#040404" : "#555",
                borderRadius: 10, fontWeight: 700, fontFamily: "var(--font-headline)", fontSize: 18, letterSpacing: 1,
                textDecoration: "none", cursor: selectedVariant && selectedVariant.stock > 0 ? "pointer" : "not-allowed",
                pointerEvents: selectedVariant && selectedVariant.stock > 0 ? "auto" : "none"
              }}
            >
              {selectedVariant && selectedVariant.stock > 0 ? "ADD TO CART" : "OUT OF STOCK"}
            </a>

            {/* Sections */}
            {sections.length > 0 ? (
              <div style={{ display: "grid", gap: 0, borderTop: "1px solid #1f1f22", marginTop: 8 }}>
                {sections.map((section, si) => (
                  <SectionAccordion key={si} section={section} defaultOpen={si === 0} />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}

function SectionAccordion({ section, defaultOpen }: { section: ProductSection; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div style={{ borderBottom: "1px solid #1f1f22" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", textAlign: "left", padding: "14px 0", background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", color: "#f7f2e9" }}
      >
        <span style={{ fontFamily: "var(--font-headline)", fontSize: 16, letterSpacing: 0.6 }}>{section.title}</span>
        <span style={{ fontSize: 20, color: "#a3a3ad", lineHeight: 1 }}>{open ? "−" : "+"}</span>
      </button>
      {open ? (
        <ul style={{ margin: 0, paddingLeft: 0, paddingBottom: 14, display: "grid", gap: 6, listStyle: "none" }}>
          {section.items.filter((item) => item.trim()).map((item, ii) => (
            <li key={ii} style={{ color: "#a3a3ad", fontSize: 14, lineHeight: 1.6, paddingLeft: 12, borderLeft: "2px solid #252529" }}>
              {item}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
