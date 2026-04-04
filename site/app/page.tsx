"use client";

import { useRef, useState } from "react";

type Product = {
  id: "midnight" | "sunrise";
  name: string;
  mood: string;
  price: string;
  glow: "red" | "amber";
};

const PRODUCTS: Product[] = [
  {
    id: "midnight",
    name: "MIDNIGHT",
    mood: "Aggressive / Deep / Night",
    price: "$34",
    glow: "red",
  },
  {
    id: "sunrise",
    name: "SUNRISE",
    mood: "Clean / Warm / Smooth",
    price: "$34",
    glow: "amber",
  },
];

export default function Home() {
  const productsRef = useRef<HTMLElement>(null);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);

  const openQuickBuy = (product: Product) => {
    setSelectedProduct(product);
    setQuantity(1);
  };

  const closeQuickBuy = () => setSelectedProduct(null);

  return (
    <main
      className="dbf-experience"
    >

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
        {PRODUCTS.map((product) => (
          <article
            key={product.id}
            className={`product-scene ${product.glow}`}
            aria-label={`${product.name} fragrance`}
            onClick={() => openQuickBuy(product)}
            style={{ cursor: "pointer" }}
          >
            <div className="scene-bg-glow" aria-hidden="true" />
            <div className="product-visual" aria-hidden="true">
              <img src={`/products/${product.id}.png`} alt="" className="product-img" />
            </div>
            <div className="scene-card-info">
              <p className="scene-mini-title">{product.name}</p>
              <p className="scene-mini-price">{product.price}</p>
            </div>
          </article>
        ))}
      </section>

      <footer id="contact" className="art-footer">
        <p className="footer-brand">DRIVEN BY FAITH</p>
        <div className="footer-links">
          <a href="#" aria-label="Instagram">
            INSTAGRAM
          </a>
          <a href="#" aria-label="TikTok">
            TIKTOK
          </a>
          <a href="#" aria-label="Contact">
            CONTACT
          </a>
        </div>
      </footer>

      {selectedProduct && (
        <div className="quick-buy-overlay" role="dialog" aria-modal="true" aria-label="Quick buy">
          <button type="button" className="overlay-close" onClick={closeQuickBuy}>
            CLOSE
          </button>
          <div className={`quick-buy-card ${selectedProduct.glow}`}>
            <div className="quick-visual" aria-hidden="true">
              <div className="quick-shape">
                <span className="shape-hole" />
              </div>
            </div>
            <div className="quick-content">
              <p className="quick-label">{selectedProduct.name}</p>
              <p className="quick-price">{selectedProduct.price}</p>
              <label htmlFor="qty">QUANTITY</label>
              <div className="qty-row">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  aria-label="Decrease quantity"
                >
                  -
                </button>
                <input
                  id="qty"
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                />
                <button
                  type="button"
                  onClick={() => setQuantity((q) => q + 1)}
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
              <button type="button" className="buy-now">
                BUY NOW
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
