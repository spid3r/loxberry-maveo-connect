#!/usr/bin/env node
/**
 * Ensures `maveo-connect-stick-client` has a built `dist/` for TypeScript tooling and esbuild:
 * - CI: `.github/workflows` checks out `maveo-connect-stick-client` into `./maveo-connect-stick-client/`.
 * - Local dev: side-by-side clone at `../maveo-connect-stick-client` works too.
 * - Otherwise tries to build inside the hoisted `node_modules/` copy once Git publishes full sources.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nm = path.join(root, "node_modules", "maveo-connect-stick-client");
const distMain = path.join(nm, "dist", "index.js");

if (fs.existsSync(distMain)) {
  process.exit(0);
}

const candidates = [
  path.join(root, "maveo-connect-stick-client"),
  path.resolve(root, "..", "maveo-connect-stick-client"),
];

let sourceRoot = "";
for (const c of candidates) {
  if (fs.existsSync(path.join(c, "package.json"))) {
    sourceRoot = c;
    break;
  }
}

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

if (sourceRoot) {
  process.stdout.write(`[postinstall] Linking maveo-connect-stick-client from ${sourceRoot}\n`);
  fs.rmSync(nm, { recursive: true, force: true });
  if (process.platform === "win32") {
    fs.symlinkSync(sourceRoot, nm, "junction");
  } else {
    fs.symlinkSync(sourceRoot, nm, "dir");
  }
  const b = spawnSync(npmCmd, ["run", "build"], {
    cwd: nm,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  process.exit(b.status ?? 1);
}

if (!fs.existsSync(nm)) {
  process.stderr.write("[postinstall] maveo-connect-stick-client missing from node_modules.\n");
  process.exit(1);
}

if (!fs.existsSync(path.join(nm, "tsconfig.build.json"))) {
  process.stderr.write(
    "[postinstall] Hoisted dependency has no tsconfig.build.json.\n" +
      "Either add CI checkout steps (see .github/workflows) or bump the library revision that ships src + tsconfigs in package.json#files.\n",
  );
  process.exit(1);
}

process.stdout.write("[postinstall] Building maveo-connect-stick-client in node_modules…\n");
const r = spawnSync(npmCmd, ["run", "build"], {
  cwd: nm,
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(r.status ?? 1);
