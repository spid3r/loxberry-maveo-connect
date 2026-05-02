#!/usr/bin/env node
/**
 * Capture wiki PNGs under docs/wiki-assets/ (Playwright test "wiki-asset screenshots").
 *
 * Sets E2E_LIVE=1 for this process unless already set — the test lives in a describe()
 * that otherwise skips entirely when E2E_LIVE is unset (easy to miss when only .env
 * has LOXBERRY_* for deploy).
 *
 * Usage:
 *   node scripts/wiki-screenshots.mjs
 *   node scripts/wiki-screenshots.mjs --headed
 *   node scripts/wiki-screenshots.mjs --ui
 *
 * Forwards any extra args to `playwright test` (after the fixed test path + grep).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = resolve(root, ".env");
if (existsSync(envFile)) {
  const proc = /** @type {NodeJS.Process & { loadEnvFile?: (p: string) => void }} */ (process);
  proc.loadEnvFile?.(envFile);
}

const env = { ...process.env };
if (env.E2E_LIVE === undefined || String(env.E2E_LIVE).trim() === "") {
  env.E2E_LIVE = "1";
}

const extra = process.argv.slice(2);
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const args = [
  "playwright",
  "test",
  "test-e2e/live-status.spec.ts",
  "--grep",
  "wiki-asset screenshots",
  ...extra,
];

const r = spawnSync(npx, args, {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
  env,
});

process.exit(r.status ?? 1);
