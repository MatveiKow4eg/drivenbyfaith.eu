"use client";

import { useRouter } from "next/navigation";

export default function CheckoutSuccess() {
  const router = useRouter();
  return (
    <main className="dbf-experience dbf-checkout-page">
      <div className="dbf-checkout-shell dbf-checkout-success-wrap">
        <div className="dbf-success-icon" aria-hidden="true">
          <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="28" cy="28" r="27" stroke="rgba(255,141,38,0.5)" strokeWidth="1.5" />
            <path d="M18 28.5L24.5 35L38 21" stroke="#ff8e26" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="dbf-checkout-title">Thank you!</h1>
        <p className="dbf-success-sub">Your order has been placed successfully. You'll receive a confirmation email shortly.</p>
        <button onClick={() => router.push("/")} className="dbf-checkout-btn dbf-success-btn">
          Back to shop
        </button>
      </div>
    </main>
  );
}
