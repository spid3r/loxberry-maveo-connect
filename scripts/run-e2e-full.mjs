#!/usr/bin/env node
/**
 * Launcher for destructive Playwright E2E (loads .env via npm script wrapping dotenv‑cli).
 * Opt-in: `--yes-i-am-developer` or `MAVEO_ALLOW_DESTRUCTIVE=1`.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const argv = process.argv.slice(2);
const allowFlag =
  argv.includes("--yes-i-am-developer") || process.env.MAVEO_ALLOW_DESTRUCTIVE === "1";

if (!allowFlag) {
  process.stderr.write(
    [
      "",
      "WARNING: destructive end-to-end test.",
      "It will UNINSTALL and REINSTALL the maveoconnect plugin via loxberry-client.",
      "",
      "Run:",
      "",
      "    npm run test:e2e:full:go",
      "",
      "or:",
      "",
      "    npm run test:e2e:full -- --yes-i-am-developer",
      "",
      "or export MAVEO_ALLOW_DESTRUCTIVE=1",
      "",
    ].join("\n"),
  );
  process.exit(2);
}

const required = ["LOXBERRY_BASE_URL", "LOXBERRY_USERNAME", "LOXBERRY_PASSWORD", "LOXBERRY_SECURE_PIN"];
const missing = required.filter((name) => !process.env[name] || process.env[name].trim() === "");
if (missing.length > 0) {
  process.stderr.write(`Missing required env in .env: ${missing.join(", ")}\n`);
  process.exit(2);
}

const npxBin = process.platform === "win32" ? "npx.cmd" : "npx";

const browserCachePresent = (() => {
  const candidate =
    process.env.PLAYWRIGHT_BROWSERS_PATH && process.env.PLAYWRIGHT_BROWSERS_PATH !== "0"
      ? process.env.PLAYWRIGHT_BROWSERS_PATH
      : path.join(
          process.env.LOCALAPPDATA || process.env.HOME || process.env.USERPROFILE || repoRoot,
          "ms-playwright",
        );
  if (!fs.existsSync(candidate)) return false;
  try {
    return fs.readdirSync(candidate).some((name) => name.toLowerCase().startsWith("chromium"));
  } catch {
    return false;
  }
})();

if (!browserCachePresent) {
  spawnSync(npxBin, ["playwright", "install", "chromium"], {
    cwd: repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

const passthrough = argv.filter((a) => a !== "--yes-i-am-developer");
const isHeaded = passthrough.includes("--headed") || passthrough.includes("--ui");
const env = {
  ...process.env,
  E2E_LIVE: "1",
  ...(isHeaded ? { E2E_HEADED: "1" } : {}),
  E2E_VERBOSE: process.env.E2E_VERBOSE ?? (isHeaded ? "1" : "0"),
};

const run = spawnSync(npxBin, ["playwright", "test", ...passthrough], {
  cwd: repoRoot,
  stdio: "inherit",
  shell: process.platform === "win32",
  env,
});

process.exit(run.status ?? 1);
