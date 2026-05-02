/**
 * Validates dist/loxberry-plugin-maveoconnect-<VERSION>.zip (no dev junk, required runtime paths).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const pluginCfg = path.join(root, "plugin.cfg");

function readVersion() {
  const c = fs.readFileSync(pluginCfg, "utf-8");
  const line = c.split(/\r?\n/).find((l) => l.startsWith("VERSION="));
  return line ? line.split("=")[1].trim() : "0.0.0";
}

const version = readVersion();
const zipPath = path.join(root, "dist", `loxberry-plugin-maveoconnect-${version}.zip`);

if (!fs.existsSync(zipPath)) {
  console.error(`ZIP not found: ${zipPath} (run npm run release:zip first)`);
  process.exit(1);
}

function listZipEntries(archivePath) {
  const fromStdout = (stdout) =>
    stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  const tryUnzipZ1 = () =>
    spawnSync("unzip", ["-Z1", archivePath], { encoding: "utf-8" });
  const tryTarTf = () => spawnSync("tar", ["-tf", archivePath], { encoding: "utf-8" });
  if (process.platform === "win32") {
    const t = tryTarTf();
    if (t.status === 0) return fromStdout(t.stdout);
    const u = tryUnzipZ1();
    if (u.status === 0) return fromStdout(u.stdout);
    console.error("Could not list ZIP (tried `tar -tf`, `unzip -Z1`)", t.stderr, u.stderr);
    process.exit(1);
  }
  const u = tryUnzipZ1();
  if (u.status === 0) return fromStdout(u.stdout);
  const t = tryTarTf();
  if (t.status === 0) return fromStdout(t.stdout);
  console.error("Could not list ZIP (tried `unzip -Z1`, `tar -tf`)", u.stderr, t.stderr);
  process.exit(1);
}

const list = listZipEntries(zipPath);

const forbidden = [
  /(^|\/)node_modules\//i,
  /(^|\/)service\/src\//i,
  /(^|\/)service\/dist\//i,
  /(^|\/)service\/node_modules\//i,
  /(^|\/)service\/package(-lock)?\.json$/i,
  /(^|\/)service\/tsconfig\.json$/i,
  /(^|\/)daemon\/dist\//i,
  /(^|\/)daemon\/src\//i,
  /(^|\/)daemon\/node_modules\//i,
  /(^|\/)daemon\.sh$/i,
  /(^|\/)dist-staging\//i,
  /(^|\/)test-ts\//i,
  /(^|\/)test-e2e\//i,
  /(^|\/)scripts\//i,
  /(^|\/)\.github\//i,
  /(^|\/)\.git\//i,
  /^package\.json$/i,
  /^package-lock\.json$/i,
  /tsconfig/i,
  /playwright\.config/i,
  /\.env$/i,
  // SVG masters are dev-only — only the rendered PNGs are shipped.
  /(^|\/)icons\/icon_source(_without_text)?\.svg$/i,
];

const bad = [];
for (const entry of list) {
  for (const rx of forbidden) {
    if (rx.test(entry)) bad.push({ entry, rx: rx.toString() });
  }
}

if (bad.length) {
  console.error(
    "ZIP contains disallowed dev paths:\n" + bad.map((b) => `  - ${b.entry} (${b.rx})`).join("\n"),
  );
  process.exit(1);
}

const mustHave = [
  "maveoconnect/plugin.cfg",
  "maveoconnect/bin/service.mjs",
  "maveoconnect/daemon/daemon",
  "maveoconnect/sudoers/sudoers",
  "maveoconnect/uninstall/uninstall",
  "maveoconnect/postinstall.sh",
  "maveoconnect/preupgrade.sh",
  "maveoconnect/postupgrade.sh",
  "maveoconnect/postroot.sh",
  "maveoconnect/webfrontend/htmlauth/index.php",
  "maveoconnect/webfrontend/htmlauth/i18n.php",
  "maveoconnect/webfrontend/htmlauth/icon_64.png",
  "maveoconnect/icons/icon_64.png",
  "maveoconnect/icons/icon_128.png",
  "maveoconnect/icons/icon_256.png",
  "maveoconnect/icons/icon_512.png",
  "maveoconnect/templates/lang/language_de.ini",
  "maveoconnect/templates/lang/language_en.ini",
  "maveoconnect/webfrontend/htmlauth/images/door-0.svg",
  "maveoconnect/webfrontend/htmlauth/images/door-1.svg",
  "maveoconnect/webfrontend/htmlauth/images/door-2.svg",
  "maveoconnect/webfrontend/htmlauth/images/door-3.svg",
  "maveoconnect/webfrontend/htmlauth/images/door-4.svg",
  "maveoconnect/webfrontend/htmlauth/images/door-5.svg",
  "maveoconnect/webfrontend/htmlauth/images/door-6.svg",
  "maveoconnect/webfrontend/htmlauth/images/door-unknown.svg",
];

const missing = mustHave.filter((f) => !list.some((entry) => entry === f.replaceAll("\\", "/")));
if (missing.length) {
  console.error("ZIP missing required plugin files:\n" + missing.map((m) => `  - ${m}`).join("\n"));
  process.exit(1);
}

// `daemon/` may only contain the single init file `daemon`. If a stale `daemon/dist/`
// or other content slips in, LoxBerry installs the wrong file as the boot script.
const daemonExtra = list.filter(
  (e) => e.startsWith("maveoconnect/daemon/") && e !== "maveoconnect/daemon/" && e !== "maveoconnect/daemon/daemon",
);
if (daemonExtra.length) {
  console.error(
    "ZIP daemon/ may only contain the single init file `daemon`; extra entries:\n" +
      daemonExtra.map((e) => `  - ${e}`).join("\n"),
  );
  process.exit(1);
}

// Init script must start with a shebang so LoxBerry's exec works.
function readZipEntry(archivePath, entryName) {
  // tar (BSD/Bsdtar on Win) reads zip via -tf/-xOf; unzip uses -p. Try both.
  const tryUnzip = () => spawnSync("unzip", ["-p", archivePath, entryName], { encoding: "utf-8" });
  const tryTar = () => spawnSync("tar", ["-xOf", archivePath, entryName], { encoding: "utf-8" });
  if (process.platform === "win32") {
    const t = tryTar();
    if (t.status === 0) return t.stdout;
    const u = tryUnzip();
    if (u.status === 0) return u.stdout;
    return "";
  }
  const u = tryUnzip();
  if (u.status === 0) return u.stdout;
  const t = tryTar();
  return t.status === 0 ? t.stdout : "";
}

const initFirst = readZipEntry(zipPath, "maveoconnect/daemon/daemon").split(/\r?\n/, 1)[0] ?? "";
if (!initFirst.startsWith("#!")) {
  console.error(
    `ZIP daemon/daemon missing shebang on first line; got: ${JSON.stringify(initFirst.slice(0, 80))}`,
  );
  process.exit(1);
}

console.log(`OK: ${path.basename(zipPath)} (${list.length} entries) — plugin layout sane.`);
