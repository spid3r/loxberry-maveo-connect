#!/usr/bin/env node
/**
 * Build client library (types for dev) + bundled daemon, icons, stage plugin tree, zip.
 * Release contains a single daemon artifact: daemon/dist/service.mjs (~3.5MB) — no node_modules.
 */
import { createWriteStream, existsSync, mkdirSync, cpSync, rmSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import archiver from "archiver";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const staging = join(root, "dist-staging", "maveoconnect");
const outDir = join(root, "dist");
const outZip = join(outDir, "maveoconnect-LOXBERRY.zip");

function run(cmd, cwd, args) {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function rm(p) {
  if (existsSync(p)) rmSync(p, { recursive: true, force: true });
}

rm(staging);
mkdirSync(staging, { recursive: true });

run(process.platform === "win32" ? "node" : "node", root, [join(__dirname, "generate-icons.mjs")]);
run(process.platform === "win32" ? "npm.cmd" : "npm", root, ["run", "build"]);

const copy = (rel) => {
  const from = join(root, rel);
  const to = join(staging, rel);
  cpSync(from, to, { recursive: true });
};

copy("webfrontend");
copy("icons");
copy("plugin.cfg");
copy("daemon.sh");
copy("postroot.sh");
copy("postinstall.sh");
copy("postupgrade.sh");
copy("uninstall");

const bundleSrc = join(root, "daemon", "dist", "service.mjs");
if (!existsSync(bundleSrc)) {
  console.error("Missing daemon/dist/service.mjs — run npm run build first");
  process.exit(1);
}
mkdirSync(join(staging, "daemon", "dist"), { recursive: true });
cpSync(bundleSrc, join(staging, "daemon", "dist", "service.mjs"));

mkdirSync(outDir, { recursive: true });
if (existsSync(outZip)) rmSync(outZip);

const output = createWriteStream(outZip);
const archive = archiver("zip", { zlib: { level: 9 } });
archive.on("warning", (err) => {
  if (err.code !== "ENOENT") throw err;
});
archive.on("error", (err) => {
  throw err;
});
archive.pipe(output);
archive.directory(staging, "maveoconnect");
await archive.finalize();
await new Promise((resolve, reject) => {
  output.on("close", resolve);
  output.on("error", reject);
});

const cfgText = readFileSync(join(root, "plugin.cfg"), "utf8");
const verM = cfgText.match(/^VERSION=(.+)$/m);
console.log("Wrote", outZip, verM ? `(v${verM[1].trim()})` : "");
