import type { Metadata, Viewport } from "next";
import { Courier_Prime, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter" });
const courierPrime = Courier_Prime({ subsets: ["latin", "latin-ext"], weight: ["400", "700"], variable: "--font-courier-prime" });

export const metadata: Metadata = {
  title: "Moj Vulkanizer",
  description: "Zakažite zamenu guma bez zvanja i bez čekanja u redu.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#141414",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sr-Latn" className={`${inter.variable} ${courierPrime.variable}`}>
      <body className="min-h-dvh bg-slate-100 font-sans text-slate-900 antialiased">{children}</body>
    </html>
  );
}
