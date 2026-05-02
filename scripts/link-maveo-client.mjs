#!/usr/bin/env node
/**
 * Builds the sibling repo ../maveo-connect-stick-client and wires it via npm link (local dev against unpublished registry versions).
 *
 * Requires: repos checked out side-by-side: loxberry-maveo-connect/ and maveo-connect-stick-client/.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const libRoot = path.resolve(root, "..", "maveo-connect-stick-client");
const distIndex = path.join(libRoot, "dist", "index.js");

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  if ((r.status ?? 1) !== 0) process.exit(r.status ?? 1);
}

if (!fs.existsSync(path.join(libRoot, "package.json"))) {
  console.error(`Expected maveo-connect-stick-client next to plugin repo:\n  ${libRoot}`);
  process.exit(1);
}

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

console.log("(1/4) npm run build …\n");
run(npmCmd, ["run", "build"], libRoot);

console.log("\n(2/4) npm link (publish global link)\n");
run(npmCmd, ["link"], libRoot);

console.log("\n(3/4) npm link maveo-connect-stick-client (this repo)\n");
run(npmCmd, ["link", "maveo-connect-stick-client"], root);

console.log("(4/4) Relink service workspace package\n");
run(npmCmd, ["link", "maveo-connect-stick-client"], path.join(root, "service"));

if (!fs.existsSync(distIndex)) {
  console.error(`Link did not create expected artifact:\n  ${distIndex}`);
  process.exit(1);
}

console.log("\nDone — service resolves maveo-connect-stick-client via global link.");
