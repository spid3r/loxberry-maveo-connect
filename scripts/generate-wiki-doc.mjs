import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const TEMPLATE_PATH = path.join(root, "docs", "templates", "wiki.dokuwiki.tpl");
const CHANGELOG_PATH = path.join(root, "CHANGELOG.md");
const OUTPUT_PATH = path.join(root, "docs", "WIKI_DOKUWIKI_START.txt");

const SCREENSHOT_BASE =
  "https://raw.githubusercontent.com/spid3r/loxberry-maveo-connect/main/docs/wiki-assets";

const VERSION_HEADING_RE = /^#{1,6}\s*\[(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\]/;
const SUBSECTION_HEADING_RE = /^#{1,6}\s+\S/;

export function parseVersionsFromChangelog(changelog, maxVersions = 8, { includePrerelease = false } = {}) {
  const lines = changelog.split(/\r?\n/);
  const sections = [];
  let current = null;
  for (const line of lines) {
    const v = line.match(VERSION_HEADING_RE);
    if (v) {
      if (current) sections.push(current);
      current = { version: v[1], bullets: [] };
      continue;
    }
    if (!current) continue;
    if (SUBSECTION_HEADING_RE.test(line)) continue;
    const b = line.match(/^\s*[-*]\s+(.+)/);
    if (b) {
      const text = b[1]
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
        .replace(/`/g, "''")
        .trim();
      if (text) current.bullets.push(text);
    }
  }
  if (current) sections.push(current);
  const filtered = includePrerelease ? sections : sections.filter((s) => !s.version.includes("-"));
  return filtered.slice(0, maxVersions);
}

export function renderVersionHistory(changelogText) {
  const versions = parseVersionsFromChangelog(changelogText);
  if (versions.length === 0) {
    return "**Version History**\n\n  * CHANGELOG enthält keine Versionseinträge im erwarteten Format.";
  }
  const out = [];
  for (const v of versions) {
    out.push(`**Version ${v.version}**`);
    out.push("");
    if (v.bullets.length === 0) {
      out.push("  * Details siehe CHANGELOG.md");
    } else {
      for (const b of v.bullets.slice(0, 12)) {
        out.push(`  * ${b}`);
      }
    }
    out.push("");
  }
  return out.join("\n").trimEnd();
}

/** Optional gallery when assets exist under docs/wiki-assets/. */
export function screenshotGallerySnippet() {
  const assetsDir = path.join(root, "docs", "wiki-assets");
  let hasPng = false;
  try {
    if (fs.existsSync(assetsDir)) {
      const names = fs.readdirSync(assetsDir);
      hasPng = names.some((n) => /\.(png|jpg)$/i.test(n));
    }
  } catch {
    /* ignore */
  }

  if (!hasPng) {
    return "  * (Keine Screenshots im Repository eingecheckt — siehe Releases.)";
  }
  return [
    "  * Plugin‑Oberfläche (DE, Beispiel):",
    "",
    `{{${SCREENSHOT_BASE}/maveoconnect-overview-de.png?820|Übersicht}}`,
    "",
    `{{${SCREENSHOT_BASE}/maveoconnect-status-de.png?820|Live‑Status mit Tor‑Symbol}}`,
    "",
    `{{${SCREENSHOT_BASE}/maveoconnect-settings-de.png?820|Einstellungen inkl. Loxone/MQTT‑Hinweis}}`,
    "",
    "  * EN‑Varianten der gleichen Seiten liegen als ''maveoconnect-*-en.png'' unter ''docs/wiki-assets/'' im Repository (für zweisprachige Wikis).",
  ].join("\n");
}

/**
 * Map known Loxone asset filenames (basename without extension) to a friendly
 * caption. Anything not in this map falls back to a humanized version of the
 * filename so newly dropped PNGs are still picked up automatically.
 */
const LOXONE_CAPTIONS = {
  "loxone-config-overview": "Loxone Config — Übersicht der Bausteine",
  "loxone-virtual-input": "Virtueller Eingang (MQTT‑Status vom Plugin)",
  "loxone-virtual-output": "Virtueller Ausgang (HTTP‑Befehl an LoxBerry/Plugin)",
};

export function humanizeLoxoneCaption(basename) {
  if (LOXONE_CAPTIONS[basename]) return LOXONE_CAPTIONS[basename];
  return basename
    .replace(/[-_]+/g, " ")
    .replace(/\bloxone\b/gi, "Loxone")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Loxone gallery — auto-discovers manually curated screenshots under
 * docs/wiki-assets/loxone/. The auto Playwright screenshot test never writes
 * into this subfolder, so the contents are safe across `npm run wiki:screenshots`.
 */
export function loxoneGallerySnippet() {
  const dir = path.join(root, "docs", "wiki-assets", "loxone");
  let files = [];
  try {
    if (fs.existsSync(dir)) {
      files = fs
        .readdirSync(dir)
        .filter((n) => /\.(png|jpg|jpeg)$/i.test(n))
        .sort((a, b) => a.localeCompare(b));
    }
  } catch {
    /* ignore */
  }

  if (files.length === 0) {
    return [
      "  * (Noch keine Loxone‑Screenshots eingecheckt. Lege Bilder unter ''docs/wiki-assets/loxone/'' ab — sie werden beim nächsten ''wiki:build'' automatisch eingebettet.)",
    ].join("\n");
  }

  const lines = [
    "  * Beispielhafte Verdrahtung in **Loxone Config** — virtueller Ausgang (HTTP‑Befehl an LoxBerry) und virtueller Eingang / MQTT‑Status:",
    "",
  ];
  for (const file of files) {
    const basename = file.replace(/\.[^.]+$/, "");
    const caption = humanizeLoxoneCaption(basename);
    lines.push(`{{${SCREENSHOT_BASE}/loxone/${file}?820|${caption}}}`);
    lines.push("");
  }
  lines.push(
    "  * Detaillierte Endpunkte, Tor‑Status‑Codes und Beispiel‑URLs siehe README und Tab **Einstellungen** im Plugin.",
  );
  return lines.join("\n");
}

export function generateWikiDoc({ templateText, changelogText }) {
  const versions = renderVersionHistory(changelogText);
  const screenshots = screenshotGallerySnippet();
  const loxone = loxoneGallerySnippet();
  return templateText
    .replaceAll("{{VERSION_HISTORY}}", versions)
    .replaceAll("{{SCREENSHOT_GALLERY}}", screenshots)
    .replaceAll("{{LOXONE_GALLERY}}", loxone);
}

export function run() {
  const templateText = fs.readFileSync(TEMPLATE_PATH, "utf-8");
  const changelogText = fs.existsSync(CHANGELOG_PATH)
    ? fs.readFileSync(CHANGELOG_PATH, "utf-8")
    : "# CHANGELOG\n\n## [0.0.1]\n\n- Initial wiki generation.\n";
  const out = generateWikiDoc({ templateText, changelogText });
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${out.trimEnd()}\n`, "utf-8");
  console.log(`Generated ${path.relative(root, OUTPUT_PATH)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  run();
}
