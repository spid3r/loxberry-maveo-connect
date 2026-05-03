import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

export const REQUIRED_HEADINGS = [
  "====== Maveo Connect / Marantec (Connect Stick over MQTT) ======",
  "===== Überblick =====",
  "===== Download =====",
  "===== Installation =====",
  "===== Konfiguration (Auszug) =====",
  "===== Screenshots =====",
  "===== Loxone-Anbindung (Beispiel) =====",
  "===== MQTT-Weiterleitung =====",
  "===== HTTP-Daemon (intern) =====",
  "===== Support / Fehler melden =====",
];

export function validateWikiDoc(text) {
  const errors = [];

  if (/\{\{[A-Z0-9_]+\}\}/.test(text)) {
    errors.push("Unresolved template placeholders found.");
  }
  if (/^#\s+/m.test(text)) {
    errors.push("Markdown heading syntax ('#') is not allowed.");
  }
  if (/```/.test(text)) {
    errors.push("Markdown fenced code blocks are not allowed.");
  }
  if (/^\s*[-*]\s+```/m.test(text)) {
    errors.push("Suspicious markdown code fence list line detected.");
  }
  if (/\[[^\]]+\]\([^)]*\)/.test(text)) {
    errors.push("Markdown links detected; use DokuWiki links [[url|text]].");
  }

  for (const heading of REQUIRED_HEADINGS) {
    if (!text.includes(heading)) {
      errors.push(`Missing required heading: ${heading}`);
    }
  }

  const rawHttpLines = text
    .split(/\r?\n/)
    .filter((line) => line.includes("http://") && !line.includes("[[http") && !line.includes("%%http://"));
  if (rawHttpLines.length > 0) {
    errors.push("Found unprotected raw http:// URLs outside %%...%% or [[...]] syntax.");
  }

  if (!/\+\+\+\+\s+Version History\s+\|/.test(text)) {
    errors.push("Version history collapse block header is missing.");
  }
  if ((text.match(/^\+\+\+\+$/gm) || []).length < 1) {
    errors.push("Version history collapse block is not properly closed (missing final ++++).");
  }

  return { valid: errors.length === 0, errors };
}

export function run(filePath = path.join(root, "docs", "WIKI_DOKUWIKI_START.txt")) {
  const text = fs.readFileSync(filePath, "utf-8");
  const result = validateWikiDoc(text);
  if (!result.valid) {
    for (const err of result.errors) {
      console.error(`- ${err}`);
    }
    throw new Error(`Wiki validation failed for ${path.relative(root, filePath)}.`);
  }
  console.log(`Wiki validation OK: ${path.relative(root, filePath)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const argPath = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
  run(argPath);
}
