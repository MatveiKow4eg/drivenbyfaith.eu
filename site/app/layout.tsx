import type { Metadata, Viewport } from "next";
import { Chakra_Petch, Teko } from "next/font/google";
import "./globals.css";

const headline = Teko({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-headline",
});

const body = Chakra_Petch({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "Driven By Faith",
  description: "Driven By Faith",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${headline.variable} ${body.variable}`}>{children}</body>
    </html>
  );
}
