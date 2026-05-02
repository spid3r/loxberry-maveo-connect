/**
 * Beta-only release lane: version is always `{latest stable tag}-beta.N` (only N increments).
 * Stable semver + CHANGELOG from conventional commits stay on `main` via semantic-release.
 *
 * semantic-release does not support this policy on prerelease branches by design (it may
 * bump the core after a `fix:` once a stable tag exists). This script is the explicit lane.
 *
 * Mirrors the pattern used by loxberry-api-abfall-io (same maintainer/CI lane).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const PRERELEASE_ID = "beta";
const CHANGELOG = path.join(root, "CHANGELOG.md");
const ZIP_NAME_BASE = "loxberry-plugin-maveoconnect";

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8", cwd: root, stdio: ["pipe", "pipe", "pipe"] }).trim();
}

function repoSlug() {
  try {
    const u = sh("git config --get remote.origin.url");
    const m = u.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/i);
    return m ? m[1] : "spid3r/loxberry-maveo-connect";
  } catch {
    return "spid3r/loxberry-maveo-connect";
  }
}

function tagVersions() {
  const raw = sh("git tag -l");
  const tags = raw
    .split("\n")
    .filter(Boolean)
    .map((t) => (t.startsWith("v") ? t.slice(1) : t))
    .filter((v) => semver.valid(v));
  return [...new Set(tags)];
}

function latestStable(versions) {
  return versions.filter((v) => !semver.prerelease(v)).sort(semver.rcompare)[0] ?? null;
}

function coreTriple(version) {
  const p = semver.parse(version);
  return p ? `${p.major}.${p.minor}.${p.patch}` : null;
}

function matchingBetas(versions, baseCore) {
  return versions.filter((v) => {
    if (!semver.prerelease(v)) return false;
    const pre = semver.prerelease(v);
    if (!pre || String(pre[0]) !== PRERELEASE_ID) return false;
    return coreTriple(v) === baseCore;
  });
}

/** Subjects worth listing in a beta CHANGELOG entry (aligned with semantic-release types). */
function isReleasableSubject(line) {
  return /^(feat|fix|perf|revert)(\([^)]*\))?!?:/.test(line);
}

function commitSubjectsSince(fromRef) {
  try {
    return sh(`git log ${fromRef}..HEAD --pretty=format:%s`)
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function prependChangelog(version, fromRef, slug) {
  const date = new Date().toISOString().slice(0, 10);
  const compare = `https://github.com/${slug}/compare/${fromRef}...v${version}`;
  const subjects = commitSubjectsSince(fromRef).filter(isReleasableSubject);
  const bullets = subjects.length
    ? subjects.map((s) => `* ${s}`).join("\n")
    : "* Beta integration build (see commits on branch `beta`).";
  const block = `## [${version}](${compare}) (${date})\n\n${bullets}\n\n`;
  const prev = fs.existsSync(CHANGELOG) ? fs.readFileSync(CHANGELOG, "utf8") : "";
  fs.writeFileSync(CHANGELOG, block + prev, "utf8");
}

function run(cmd) {
  execSync(cmd, { cwd: root, stdio: "inherit", shell: true });
}

const dry = process.env.BETA_RELEASE_DRY_RUN === "1";
const ci = process.env.GITHUB_ACTIONS === "true";

if (ci && process.env.GITHUB_REF !== "refs/heads/beta") {
  console.log("Not on beta ref; skipping.");
  process.exit(0);
}

try {
  execSync("git fetch --tags origin", { cwd: root, stdio: "ignore" });
} catch {
  // ignore fetch errors (offline / no network)
}

const all = tagVersions();
const stable = latestStable(all);
if (!stable) {
  throw new Error("beta-release: no stable semver tag found (need at least one vX.Y.Z release on main).");
}

const betas = matchingBetas(all, stable);
const lastBeta = betas.sort(semver.rcompare)[0];
const nextVersion = lastBeta ? semver.inc(lastBeta, "prerelease", PRERELEASE_ID) : `${stable}-${PRERELEASE_ID}.1`;

if (!semver.valid(nextVersion)) {
  throw new Error(`beta-release: invalid computed version: ${nextVersion}`);
}

const fromRef = lastBeta ? `v${lastBeta}` : `v${stable}`;
const lines = commitSubjectsSince(fromRef);

if (lines.length === 0) {
  console.log(`No commits since ${fromRef}; skip beta release.`);
  process.exit(0);
}

if (lines.every((l) => /^chore\(release\):/.test(l))) {
  console.log(`Only release-bot commits since ${fromRef}; skip beta release.`);
  process.exit(0);
}

const hasMerge = lines.some((l) => /^Merge /i.test(l));
const hasReleasable = lines.some(isReleasableSubject);
if (!hasReleasable && !hasMerge) {
  console.log(`No releasable commits (feat/fix/perf/revert) and no merge since ${fromRef}; skip beta release.`);
  process.exit(0);
}

const tagName = `v${nextVersion}`;
try {
  if (sh(`git tag -l ${tagName}`)) {
    console.log(`Tag ${tagName} already exists; skip.`);
    process.exit(0);
  }
} catch {
  // ignore
}

console.log(`Beta next version: ${nextVersion} (from ${fromRef}, stable core ${stable})`);

if (dry) {
  process.exit(0);
}

if (!ci) {
  console.warn("Run on GitHub Actions (push to beta), or locally: BETA_RELEASE_DRY_RUN=1 npm run release:beta");
  process.exit(1);
}

prependChangelog(nextVersion, fromRef, repoSlug());

run(`node ./scripts/prepare-release.mjs ${nextVersion}`);
run(`node ./scripts/prepare-autoupdate-cfg.mjs ${nextVersion}`);
run(`npm run wiki:build`);
run(`npm run release:zip`);

const zip = path.join(root, "dist", `${ZIP_NAME_BASE}-${nextVersion}.zip`);
if (!fs.existsSync(zip)) {
  throw new Error(`beta-release: missing ${zip}`);
}

run('git config user.email "semantic-release-bot@martynus.net"');
run('git config user.name "semantic-release-bot"');

run("git add CHANGELOG.md plugin.cfg package.json prerelease.cfg docs/WIKI_DOKUWIKI_START.txt");
run(`git commit -m "chore(release): ${nextVersion} [skip ci]"`);
run(`git tag ${tagName}`);
run("git push origin HEAD:beta");
run(`git push origin ${tagName}`);

const notesPath = path.join(root, ".beta-release-notes.md");
const notes = `Prerelease on branch \`beta\` for stable line **${stable}**. Version **${nextVersion}** only increments \`-beta.N\`; semver bumps for stable happen on \`main\` via semantic-release.`;
fs.writeFileSync(notesPath, notes, "utf8");
try {
  run(`gh release create "${tagName}" "${zip}" --prerelease --title "${tagName}" --notes-file "${notesPath}"`);
} finally {
  fs.rmSync(notesPath, { force: true });
}

console.log(`Published beta ${nextVersion}.`);
