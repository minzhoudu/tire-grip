import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tire Grip",
  description: "Zakažite zamenu guma bez zvanja i bez čekanja u redu.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f2540",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sr-Latn">
      <body className="min-h-dvh bg-slate-100 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
