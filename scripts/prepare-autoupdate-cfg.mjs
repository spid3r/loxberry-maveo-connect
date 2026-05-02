/**
 * Updates `release.cfg` (stable) OR `prerelease.cfg` (X.Y.Z-beta.N) — never both —
 * with the URL of the GitHub Release ZIP that semantic-release / beta-release.mjs is
 * about to publish. This file feeds LoxBerry's auto-update mechanism: stable users
 * pin to release.cfg, beta testers can point INFOURL/ARCHIVEURL to prerelease.cfg.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const nextVersion = process.argv[2];

if (!nextVersion) {
  throw new Error("Missing next release version argument.");
}

const pj = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8"));
const repoUrlRaw = pj?.repository?.url;
if (typeof repoUrlRaw !== "string" || !repoUrlRaw.trim()) {
  throw new Error("package.json must contain repository.url for autoupdate links.");
}

/** Parse owner/repo from common GitHub URL shapes. */
function parseGitHub(repoUrl) {
  const trimmed = repoUrl.trim().replace(/\.git$/i, "").replace(/^git\+/, "");
  const mHttps = trimmed.match(/github\.com\/([^/]+)\/([^/]+)$/i);
  if (mHttps) return `${mHttps[1]}/${mHttps[2]}`;
  const mAt = trimmed.match(/^git@github\.com:([^/]+)\/(.+)$/i);
  if (mAt) return `${mAt[1]}/${mAt[2]}`;
  throw new Error(`Could not derive GitHub slug from repository.url: ${repoUrlRaw}`);
}

const slug = parseGitHub(repoUrlRaw.trim());
const tag = `v${nextVersion}`;
const archiveUrl = `https://github.com/${slug}/releases/download/${tag}/loxberry-plugin-maveoconnect-${nextVersion}.zip`;
const infoUrl = `https://github.com/${slug}/releases/tag/${tag}`;

const cfg = [
  "[AUTOUPDATE]",
  `VERSION=${nextVersion}`,
  `ARCHIVEURL=${archiveUrl}`,
  `INFOURL=${infoUrl}`,
  "",
].join("\n");

const isPrerelease = /\d+\.\d+\.\d+-/.test(nextVersion);
const target = isPrerelease ? "prerelease.cfg" : "release.cfg";
fs.writeFileSync(path.join(root, target), cfg, "utf-8");
console.log(`Updated ${target} for ${nextVersion} (${slug}).`);
