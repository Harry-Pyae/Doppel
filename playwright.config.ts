import { execSync } from "node:child_process";
import { defineConfig } from "@playwright/test";

// End-to-end tests run against the LOCAL Supabase only (npx supabase start), never the
// shared project: they create test accounts there. The dev server gets the local keys.
const status = JSON.parse(execSync("npx supabase status -o json", { stdio: ["ignore", "pipe", "ignore"] }).toString());
const url: string = status.API_URL;
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error(`E2E needs the local Supabase, not ${url}`);
export const local = { url, anonKey: status.ANON_KEY as string, serviceKey: status.SERVICE_ROLE_KEY as string };
process.env.E2E_SUPABASE_URL = url;
process.env.E2E_SERVICE_KEY = local.serviceKey;
process.env.E2E_ANON_KEY = local.anonKey;

const port = 3100;
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.e2e.ts",
  // The README screenshots run only through `npm run screens`.
  grepInvert: process.env.npm_lifecycle_event === "screens" ? undefined : /@screens/,
  globalSetup: "./tests/e2e/setup.ts",
  // Every test shares the four test accounts, so they run one at a time.
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 390, height: 844 },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npx next dev -p ${port}`,
    url: `http://localhost:${port}/sign-in`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      NEXT_DIST_DIR: ".next-e2e",
      NEXT_PUBLIC_SUPABASE_URL: url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: local.anonKey,
      SUPABASE_SERVICE_ROLE_KEY: local.serviceKey,
    },
  },
});
