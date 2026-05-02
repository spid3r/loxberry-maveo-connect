/**
 * Builds LoxBerry plugin PNG icons (64/128/256/512) from Inkscape SVG masters.
 *
 * - icons/icon_{64,...,512}.png — from icon_source.svg (with label). Copied by
 *   LoxBerry into /system/images/icons/<PLUGIN>/ → plugin overview / widgets.
 * - webfrontend/html/icon_64.png & htmlauth/icon_64.png — from
 *   icon_source_without_text.svg → compact glyph in embedded admin UI header.
 *
 * Squircle framing: full-bleed rounded tile + light 3D + shadow; artwork trimmed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const iconsDir = path.join(root, "icons");

const sizes = [64, 128, 256, 512];

/** iOS-style corner radius as fraction of side (full-bleed squircle). */
const SQUIRCLE_RX_RATIO = 0.2237;

/** Minimal inset between squircle edge and artwork (fraction of side). */
const ART_INSET_RATIO = 0.022;

/** Labelled asset for system/overview icons (preferred). Falls back below. */
const SVG_OVERVIEW = "icon_source.svg";
/** Glyph-only asset for iframe admin header preview. */
const SVG_UI_EMBED = "icon_source_without_text.svg";

function fullBleedSquircleSvg(pixelSize) {
  const s = pixelSize;
  const rx = Math.min(Math.round(s * SQUIRCLE_RX_RATIO), Math.floor(s / 2));
  const dy = Math.max(1, Math.round(s * 0.014));
  const blur = Math.max(1.5, s * 0.02);
  const outerStroke = Math.max(0.85, s * 0.006);
  const inset = Math.max(1, Math.round(s * 0.016));
  const innerW = s - 2 * inset;
  const innerRx = Math.min(Math.round(innerW * SQUIRCLE_RX_RATIO), Math.floor(innerW / 2));
  const innerGleam = Math.max(0.55, s * 0.0032);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
<defs>
  <linearGradient id="tileFace" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#ffffff"/>
    <stop offset="52%" stop-color="#f3f4f6"/>
    <stop offset="100%" stop-color="#d9dee4"/>
  </linearGradient>
  <filter id="tile3d" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">
    <feDropShadow dx="0" dy="${dy}" stdDeviation="${blur}" flood-color="#1a2233" flood-opacity="0.24"/>
  </filter>
</defs>
<rect width="${s}" height="${s}" rx="${rx}" ry="${rx}" fill="url(#tileFace)" stroke="rgba(0,0,0,0.1)" stroke-width="${outerStroke}" filter="url(#tile3d)"/>
<rect x="${inset}" y="${inset}" width="${innerW}" height="${innerW}" rx="${innerRx}" ry="${innerRx}" fill="none" stroke="rgba(255,255,255,0.42)" stroke-width="${innerGleam}"/>
</svg>`;
}

/**
 * @param {string} svgPath
 * @param {number} pixelSize
 */
async function renderFramedAppIcon(svgPath, pixelSize) {
  const s = pixelSize;
  const pad = Math.max(0, Math.round(s * ART_INSET_RATIO));
  const artBox = Math.max(8, s - 2 * pad);

  const baseBuf = await sharp(Buffer.from(fullBleedSquircleSvg(s), "utf8")).ensureAlpha().png().toBuffer();

  const svgBuf = fs.readFileSync(svgPath);
  const artSharp = sharp(svgBuf).trim({ threshold: 2 });
  const artBuf = await artSharp
    .resize(artBox, artBox, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .png()
    .toBuffer();

  const meta = await sharp(artBuf).metadata();
  const aw = meta.width || artBox;
  const ah = meta.height || artBox;
  const left = pad + Math.round((artBox - aw) / 2);
  const top = pad + Math.round((artBox - ah) / 2);

  return sharp(baseBuf)
    .composite([{ input: artBuf, left, top }])
    .png()
    .toBuffer();
}

async function main() {
  const pathOverview = path.join(iconsDir, SVG_OVERVIEW);
  const pathUi = path.join(iconsDir, SVG_UI_EMBED);

  if (!fs.existsSync(pathUi)) {
    throw new Error(`Missing required SVG: ${path.relative(root, pathUi)}`);
  }
  const overviewSvg = fs.existsSync(pathOverview) ? pathOverview : pathUi;
  if (overviewSvg === pathUi) {
    console.warn(`Using ${SVG_UI_EMBED} for icons/icon_*.png (${SVG_OVERVIEW} missing).`);
  }

  console.log(`Overview set (icons/icon_*.png): ${path.relative(root, overviewSvg)}`);
  for (const size of sizes) {
    const out = path.join(iconsDir, `icon_${size}.png`);
    const png = await renderFramedAppIcon(overviewSvg, size);
    fs.writeFileSync(out, png);
    console.log(`  Wrote ${path.relative(root, out)}`);
  }

  console.log(`Embedded UI thumb: ${SVG_UI_EMBED}`);
  const small = await renderFramedAppIcon(pathUi, 64);
  for (const rel of ["webfrontend/html/icon_64.png", "webfrontend/htmlauth/icon_64.png"]) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, small);
    console.log(`Wrote ${rel}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
