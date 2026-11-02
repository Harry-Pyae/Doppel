import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope, Noto_Sans_Myanmar } from "next/font/google";
import { art } from "@/lib/art";
import { getLocale } from "@/server/locale";
import "./globals.css";

const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], weight: ["600", "700"] });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"], weight: ["400", "500", "700"] });
// Burmese always uses a web font so older phones (or Zawgyi system fonts) still render Unicode Burmese.
const myanmar = Noto_Sans_Myanmar({ variable: "--font-myanmar", subsets: ["myanmar"], weight: ["400", "500", "700"] });

export const metadata: Metadata = {
  title: "Doppel",
  description: "A PolyHydra Free-To-Play party game for one room of phones.",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Doppel", statusBarStyle: "default" },
  // favicon.ico is served from public/ by its usual name; the rest only once npm run art made them.
  icons: art.icons
    ? {
        icon: [
          { url: "/icons/icon-16.png", sizes: "16x16", type: "image/png" },
          { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
        ],
        apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
      }
    : undefined,
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#e4d8bb" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    // With the menu art, wide screens show its darkest walnut beside the phone-width column.
    <html
      lang={locale}
      className={`${fraunces.variable} ${manrope.variable} ${myanmar.variable} antialiased`}
      style={art.menu ? { backgroundColor: art.menu.color } : undefined}
    >
      <body>{children}</body>
    </html>
  );
}
