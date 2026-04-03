import type { Metadata } from "next";
import { Bebas_Neue, Sora } from "next/font/google";
import "./globals.css";

const headline = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-headline",
});

const body = Sora({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "Driven By Faith",
  description: "Driven By Faith",
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
