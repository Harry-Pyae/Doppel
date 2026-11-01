import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // Character art is dropped in pre-sized (512 px webp), so plain <img> is intended.
  { files: ["src/**"], rules: { "@next/next/no-img-element": "off" } },
  globalIgnores([".next/**", ".next-*/**", "next-env.d.ts", ".claude/**", "playwright-report/**", "test-results/**"]),
]);
