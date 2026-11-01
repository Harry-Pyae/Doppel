import { readdirSync } from "node:fs";
import type { NextConfig } from "next";

// Character images that exist (public/characters/<id>.webp); the rest use the placeholder.
// Read at build (and dev start), so a dropped-in image needs a redeploy or a dev restart.
const images = readdirSync("public/characters").filter((f) => f.endsWith(".webp"));

const production = process.env.NODE_ENV === "production";
const supabase = (() => {
  try {
    const { origin } = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return ` ${origin} ${origin.replace(/^http/, "ws")}`;
  } catch {
    return "";
  }
})();
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${production ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${supabase}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  // The PolyHydra hand-off will POST here from the hub; add its origin then (README).
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  // A second build folder lets the end-to-end server run beside a dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  env: { NEXT_PUBLIC_CHARACTER_IMAGES: images.join(",") },
  poweredByHeader: false,
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
