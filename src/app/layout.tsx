import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope, Noto_Sans_Myanmar } from "next/font/google";
import { getLocale } from "@/server/locale";
import "./globals.css";

const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], weight: ["600", "700"] });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"], weight: ["400", "500", "700"] });
// Burmese always uses a web font so older phones (or Zawgyi system fonts) still render Unicode Burmese.
const myanmar = Noto_Sans_Myanmar({ variable: "--font-myanmar", subsets: ["myanmar"], weight: ["400", "500", "700"] });

export const metadata: Metadata = {
  title: "Vote Out the Imposter",
  description: "A PolyHydra Free-To-Play party game for one room of phones.",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Imposter", statusBarStyle: "default" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#e4d8bb" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${fraunces.variable} ${manrope.variable} ${myanmar.variable} antialiased`}>
      <body>{children}</body>
    </html>
  );
}
