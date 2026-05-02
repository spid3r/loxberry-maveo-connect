/**
 * Destructive E2E (test-e2e/) — disabled unless E2E_LIVE=1 (matches sibling LoxBerry plugins).
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";

/** Load `.env` from repo root so `httpCredentials` see LOXBERRY_USERNAME / LOXBERRY_PASSWORD without a shell wrapper. */
const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  const proc = process as NodeJS.Process & { loadEnvFile?: (path: string) => void };
  proc.loadEnvFile?.(envPath);
}

const baseURL =
  process.env.LOXBERRY_BASE_URL && process.env.LOXBERRY_BASE_URL.trim() !== ""
    ? process.env.LOXBERRY_BASE_URL.trim()
    : "http://loxberry.local";

const isCi = process.env.CI === "true" || !!process.env.GITHUB_ACTIONS;
const runHeaded =
  !isCi && process.env.E2E_HEADED !== "0" && process.env.E2E_HEADED !== "false";

export default defineConfig({
  testDir: "./test-e2e",
  testMatch: /.*\.spec\.ts$/,
  timeout: 15 * 60 * 1000,
  expect: { timeout: 30_000 },
  retries: 0,
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    headless: isCi || !runHeaded,
    /** HTTP Basic (LoxBerry admin popup) — aus `.env`: LOXBERRY_USERNAME, LOXBERRY_PASSWORD */
    httpCredentials: {
      username: process.env.LOXBERRY_USERNAME?.trim() ?? "",
      password: process.env.LOXBERRY_PASSWORD?.trim() ?? "",
    },
    ignoreHTTPSErrors: true,
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        launchOptions: {
          ...(process.env.PW_CHROME_CHANNEL ? { channel: process.env.PW_CHROME_CHANNEL } : {}),
          args: runHeaded ? ["--start-maximized"] : [],
          /** Optional artificial delay (ms/action). Default 0 — headed runs were too slow with 250ms. */
          slowMo: process.env.PWSLOWMO ? Number(process.env.PWSLOWMO) : 0,
        },
      },
    },
  ],
});
