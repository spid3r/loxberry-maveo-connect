/**
 * Glue around loxberry-client for destructive install/reinstall workflows.
 * Copied/adapted from loxberry-api-abfall-io; paths and ZIP naming are Maveo-specific.
 */

import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import { request as playwrightRequest, type APIRequestContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const REPO_ROOT = path.resolve(__dirname, "..", "..");
export const PLUGIN_FOLDER = (process.env.PLUGIN_FOLDER || "maveoconnect").trim();
export const ENV_FILE = path.join(REPO_ROOT, ".env");

const CLI_PATH = path.join(REPO_ROOT, "node_modules", "loxberry-client-library", "dist", "cli.cjs");

interface PluginListRow {
  folder?: string;
  name?: string;
  md5?: string;
}

export type PluginListResult = { ok: true; rows: PluginListRow[] } | { ok: false; error: string };

const VERBOSE = process.env.E2E_VERBOSE === "1";

export const E2E_SKIP_UNINSTALL = process.env.E2E_SKIP_UNINSTALL === "1";

export function e2eMsFromEnv(name: string, defaultMs: number): number {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === "") return defaultMs;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : defaultMs;
}

function formatCliForLog(raw: string, max = 2_000): string {
  const s = raw.trim();
  if (!s) return "(no output)";
  const head = s.slice(0, 500).toLowerCase();
  if (head.includes("<!doctype") || (s.startsWith("<") && head.includes("html"))) {
    return `(HTML response, ${s.length} bytes; not echoed)`;
  }
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export async function e2eSettle(
  name: "E2E_POST_UNINSTALL_MS" | "E2E_POST_INSTALL_MS",
  defaultMs: number,
): Promise<void> {
  const ms = e2eMsFromEnv(name, defaultMs);
  if (VERBOSE && ms > 0) process.stdout.write(`[e2e] ${name}=${ms}ms\n`);
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
}

function runNode(
  args: string[],
  options: SpawnSyncOptions = {},
): { status: number; stdout: string; stderr: string } {
  const baseArgs = fs.existsSync(ENV_FILE) ? [`--env-file=${ENV_FILE}`, ...args] : args;
  if (VERBOSE) process.stdout.write(`> node ${baseArgs.join(" ")}\n`);
  const proc = spawnSync(process.execPath, baseArgs, {
    cwd: REPO_ROOT,
    encoding: "utf-8",
    stdio: "pipe",
    ...options,
  });
  const toText = (v: string | Buffer | null | undefined): string => {
    if (v == null) return "";
    return Buffer.isBuffer(v) ? v.toString("utf-8") : v;
  };
  const stdout = toText(proc.stdout);
  const stderr = toText(proc.stderr);
  if (VERBOSE) {
    if (stdout) process.stdout.write(stdout.endsWith("\n") ? stdout : stdout + "\n");
    if (stderr) process.stderr.write(stderr.endsWith("\n") ? stderr : stderr + "\n");
  }
  return { status: proc.status ?? 1, stdout, stderr };
}

export function listInstalledPluginsDetailed(): PluginListResult {
  if (!fs.existsSync(CLI_PATH)) {
    return { ok: false, error: "loxberry-client cli.cjs not found" };
  }
  const res = runNode([CLI_PATH, "plugins", "list"]);
  if (res.status !== 0) {
    return {
      ok: false,
      error: `plugins list exit ${res.status}: ${(res.stderr || res.stdout).slice(0, 2000)}`,
    };
  }
  try {
    const parsed = JSON.parse(res.stdout || "[]");
    return { ok: true, rows: Array.isArray(parsed) ? (parsed as PluginListRow[]) : [] };
  } catch (e) {
    return { ok: false, error: `plugins list parse: ${e}` };
  }
}

export function isPluginInstalled(folder: string = PLUGIN_FOLDER): boolean {
  const d = listInstalledPluginsDetailed();
  if (!d.ok) {
    return true;
  }
  return d.rows.some((row) => row?.folder === folder);
}

export function uninstallPlugin(folder: string = PLUGIN_FOLDER): {
  status: number;
  stdout: string;
  stderr: string;
} {
  const d = listInstalledPluginsDetailed();
  if (!d.ok) return { status: 1, stdout: "", stderr: d.error };
  const row = d.rows.find((r) => (r?.folder ?? "").trim() === folder);
  const pid = row?.md5?.trim();
  if (!pid) {
    return {
      status: 1,
      stdout: "",
      stderr: `E2E: no md5 in plugins list for folder '${folder}' (cannot uninstall)`,
    };
  }
  if (VERBOSE)
    process.stdout.write(`[e2e] uninstall pid (md5) ${pid.slice(0, 8)}… folder=${folder}\n`);
  return runNode([CLI_PATH, "plugins", "uninstall", "--name", pid]);
}

async function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function hasFolder(rows: PluginListRow[], folder: string): boolean {
  return rows.some((r) => (r?.folder ?? "").trim() === folder);
}

export async function waitUntilPluginInList(folder: string = PLUGIN_FOLDER): Promise<PluginListRow> {
  const waitMs = e2eMsFromEnv("E2E_INSTALL_WAIT_MS", 120_000);
  const pollMs = e2eMsFromEnv("E2E_INSTALL_POLL_MS", 750);
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    const d = listInstalledPluginsDetailed();
    if (d.ok) {
      const row = d.rows.find((r) => (r?.folder ?? "").trim() === folder);
      if (row) return row;
    }
    await sleepMs(pollMs);
  }
  throw new Error(`E2E: plugin '${folder}' not visible in plugins list after ${waitMs}ms`);
}

export async function uninstallPluginUntilRemoved(folder: string = PLUGIN_FOLDER): Promise<void> {
  const cmdAttemptsRaw = process.env.E2E_UNINSTALL_CMD_ATTEMPTS;
  const cmdAttemptsNum = Number(cmdAttemptsRaw);
  const cmdAttempts = Number.isFinite(cmdAttemptsNum)
    ? Math.max(1, Math.min(10, Math.floor(cmdAttemptsNum)))
    : 3;
  const waitMs = e2eMsFromEnv("E2E_UNINSTALL_WAIT_MS", 120_000);
  const pollMs = e2eMsFromEnv("E2E_UNINSTALL_POLL_MS", 750);

  for (let a = 0; a < cmdAttempts; a++) {
    const fresh = listInstalledPluginsDetailed();
    if (fresh.ok && !hasFolder(fresh.rows, folder)) return;

    uninstallPlugin(folder);
    const deadline = Date.now() + waitMs;
    while (Date.now() < deadline) {
      const again = listInstalledPluginsDetailed();
      if (again.ok && !hasFolder(again.rows, folder)) return;
      await sleepMs(pollMs);
    }
    process.stderr.write(`[e2e] plugin '${folder}' still listed; retry uninstall if attempts left.\n`);
  }
  throw new Error(`E2E: '${folder}' still installed`);
}

export function buildReleaseZip(): { status: number; output: string } {
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const proc = spawnSync(npmCmd, ["run", "release:zip"], {
    cwd: REPO_ROOT,
    encoding: "utf-8",
    stdio: VERBOSE ? "inherit" : "pipe",
    shell: process.platform === "win32",
  });
  return { status: proc.status ?? 1, output: `${proc.stdout ?? ""}${proc.stderr ?? ""}` };
}

export function findLatestPluginZip(): string | null {
  const distDir = path.join(REPO_ROOT, "dist");
  if (!fs.existsSync(distDir)) return null;
  const entries = fs
    .readdirSync(distDir)
    .filter((n) => /^loxberry-plugin-maveoconnect-.*\.zip$/.test(n))
    .map((n) => path.join(distDir, n))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return entries[0] ?? null;
}

export function uploadLatestPluginZip(): { status: number; stdout: string; stderr: string } {
  if (!findLatestPluginZip()) return { status: 1, stdout: "", stderr: "no release ZIP found in dist/" };
  return runNode([CLI_PATH, "plugins", "deploy", "--project", REPO_ROOT]);
}

function deployLooksBad(combined: string): boolean {
  const s = combined.toLowerCase();
  return (
    s.includes("error while extracting from plugin archive") ||
    (s.includes("cannot find or open") && s.includes(".zip")) ||
    s.includes("plugin install log reports failure")
  );
}

export async function uploadLatestPluginZipWithRetry(): Promise<{
  status: number;
  stdout: string;
  stderr: string;
}> {
  const rawN = process.env.E2E_DEPLOY_MAX_ATTEMPTS?.trim();
  const maxAttempts =
    rawN && /^\d+$/.test(rawN)
      ? Math.min(12, Math.max(1, parseInt(rawN, 10)))
      : 6;
  const retryDelayMs = e2eMsFromEnv("E2E_DEPLOY_RETRY_MS", 8_000);

  let last: ReturnType<typeof uploadLatestPluginZip> = uploadLatestPluginZip();
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const combined = `${last.stdout}\n${last.stderr}`;
    if (last.status === 0 && !deployLooksBad(combined)) return last;

    if (attempt < maxAttempts) {
      process.stdout.write(`[e2e] plugins deploy retry ${attempt + 1}/${maxAttempts} after ${retryDelayMs}ms…\n`);
      await new Promise((r) => setTimeout(r, retryDelayMs));
      last = uploadLatestPluginZip();
    }
  }
  return last;
}

export function getRequiredEnvVarsAvailable(): { ok: boolean; missing: string[] } {
  const required = [
    "LOXBERRY_BASE_URL",
    "LOXBERRY_USERNAME",
    "LOXBERRY_PASSWORD",
    "LOXBERRY_SECURE_PIN",
  ];
  const missing = required.filter((name) => !process.env[name] || process.env[name]!.trim() === "");
  return { ok: missing.length === 0, missing };
}

/**
 * Credentials for destructive E2E settings + MQTT smoke.
 * Thing name optional: UI can „Sticks laden“ after email/password saved.
 * Pool defaults come from bundled library defaults on the daemon.
 */
export function getMaveoCredentialEnvAvailable(): { ok: boolean; missing: string[] } {
  const required = ["MAVO_EMAIL", "MAVO_PASSWORD"];
  const missing = required.filter((name) => !process.env[name] || process.env[name]!.trim() === "");
  return { ok: missing.length === 0, missing };
}

/**
 * Optionally restart the daemon on the appliance after changing credentials (daemon reads settings only at startup).
 * Set `E2E_SSH_RESTART_CMD` to a shell snippet, e.g.
 * `ssh user@loxberry 'sudo lbhelper restartpluginplugindaemon maveoconnect'` — exact command depends on your LoxBerry image.
 */
export function runOptionalDaemonRestartViaSsh(): { ran: boolean; status: number; output: string } {
  const cmd = process.env.E2E_SSH_RESTART_CMD?.trim();
  if (!cmd) return { ran: false, status: 0, output: "" };

  process.stdout.write(`[e2e] running E2E_SSH_RESTART_CMD…\n`);
  const proc = spawnSync(cmd, {
    shell: true,
    encoding: "utf-8",
    stdio: "pipe",
  });
  const out = `${proc.stdout ?? ""}${proc.stderr ?? ""}`.trim();
  if ((proc.status ?? 1) !== 0 && VERBOSE) {
    process.stderr.write(out ? `${out}\n` : "(no output)\n");
  }
  return { ran: true, status: proc.status ?? 1, output: out };
}

/**
 * Polls `status.php?ajax=1` until the JSON includes `transport` (Node-Daemon hat geantwortet).
 * Ohne laufenden Daemon schlagen die UI-Probe-Calls mit „Connection refused" fehl — dann i. d. R.
 * `sudo /opt/loxberry/system/daemons/plugins/maveoconnect restart` oder `E2E_SSH_RESTART_CMD`.
 */
export async function waitUntilDaemonHttpReachable(opts: {
  pluginFolder?: string;
  deadlineMs?: number;
  pollMs?: number;
} = {}): Promise<void> {
  const base = process.env.LOXBERRY_BASE_URL?.trim();
  const user = process.env.LOXBERRY_USERNAME?.trim();
  const pass = process.env.LOXBERRY_PASSWORD?.trim();
  if (!base || !user || pass === undefined || pass === "") {
    throw new Error("waitUntilDaemonHttpReachable: LOXBERRY_BASE_URL / USERNAME / PASSWORD fehlen");
  }
  const folder = opts.pluginFolder ?? PLUGIN_FOLDER;
  const deadlineMs = opts.deadlineMs ?? e2eMsFromEnv("E2E_DAEMON_UP_MS", 200_000);
  const pollMs = opts.pollMs ?? 2_500;
  const url = `/admin/plugins/${folder}/status.php?ajax=1`;

  const ctx = await playwrightRequest.newContext({
    baseURL: base,
    httpCredentials: { username: user, password: pass },
    ignoreHTTPSErrors: true,
  });
  try {
    const deadline = Date.now() + deadlineMs;
    let lastErr = "";
    while (Date.now() < deadline) {
      const res = await ctx.get(url, { timeout: 30_000, failOnStatusCode: false });
      const txt = ((await res.text()) ?? "").trim();
      try {
        const j = txt ? (JSON.parse(txt) as Record<string, unknown>) : {};
        if (res.status() >= 200 && res.status() < 300 && typeof j.transport === "string") {
          return;
        }
        lastErr =
          (typeof j.error === "string" && j.error) ||
          (typeof j.lastError === "string" && j.lastError) ||
          `http ${res.status()}`;
      } catch {
        lastErr = `non-JSON: ${txt.slice(0, 200)}`;
      }
      await sleepMs(pollMs);
    }
    throw new Error(
      [
        `E2E: Nach ${deadlineMs}ms kein Node-Daemon (HTTP-API): ${lastErr || "(unbekannt)"}.`,
        `Auf dem LoxBerry per SSH: sudo /opt/loxberry/system/daemons/plugins/${folder} restart`,
        `Für CI/Entwicklung in .env z. B.: E2E_SSH_RESTART_CMD=ssh loxberry@loxberry "sudo /opt/loxberry/system/daemons/plugins/${folder} restart"`,
      ].join(" "),
    );
  } finally {
    await ctx.dispose();
  }
}

export type DaemonAjaxStatus = {
  mqttConnected?: boolean;
  transport?: string;
  settingsOk?: boolean;
  clientReady?: boolean;
  lastError?: string | null;
  stickSerial?: string | null;
  doorPosition?: number | null;
  doorLabel?: string | null;
  lightOn?: boolean | null;
  ok?: boolean;
};

/** One-shot status snapshot via the same `status.php?ajax=1` endpoint the UI polls. */
export async function fetchDaemonAjaxStatus(
  request: APIRequestContext,
  opts: { pluginFolder?: string } = {},
): Promise<DaemonAjaxStatus> {
  const folder = opts.pluginFolder ?? PLUGIN_FOLDER;
  const url = `/admin/plugins/${folder}/status.php?ajax=1`;
  const res = await request.get(url, { timeout: 30_000, failOnStatusCode: false });
  const txt = ((await res.text()) ?? "").trim();
  try {
    return txt ? (JSON.parse(txt) as DaemonAjaxStatus) : {};
  } catch {
    return { ok: false, lastError: `non-JSON: ${txt.slice(0, 200)}` };
  }
}

/**
 * Poll until `predicate(status)` is true OR the deadline passes.
 * Returns the last status either way so the caller can `expect()` over it.
 */
export async function pollDaemonStatusUntil(
  request: APIRequestContext,
  predicate: (s: DaemonAjaxStatus) => boolean,
  opts: { pluginFolder?: string; deadlineMs?: number; pollMs?: number } = {},
): Promise<DaemonAjaxStatus> {
  const deadlineMs = opts.deadlineMs ?? e2eMsFromEnv("E2E_STATUS_WAIT_MS", 60_000);
  const pollMs = opts.pollMs ?? e2eMsFromEnv("E2E_STATUS_POLL_MS", 1_500);
  const deadline = Date.now() + deadlineMs;
  let last: DaemonAjaxStatus = {};
  while (Date.now() < deadline) {
    last = await fetchDaemonAjaxStatus(request, opts);
    if (predicate(last)) return last;
    await sleepMs(pollMs);
  }
  return last;
}

/**
 * Polls `status.php?ajax=1` until `mqttConnected` is true or timeout (after optional SSH restart settles).
 */
export async function pollMqttConnectedAjax(
  request: APIRequestContext,
  opts: {
    pluginFolder?: string;
    deadlineMs?: number;
    pollMs?: number;
  } = {},
): Promise<DaemonAjaxStatus> {
  const folder = opts.pluginFolder ?? PLUGIN_FOLDER;
  const deadlineMs = opts.deadlineMs ?? e2eMsFromEnv("E2E_MQTT_WAIT_MS", 180_000);
  const pollMs = opts.pollMs ?? e2eMsFromEnv("E2E_MQTT_POLL_MS", 2_500);
  const url = `/admin/plugins/${folder}/status.php?ajax=1`;

  const deadline = Date.now() + deadlineMs;
  let last: DaemonAjaxStatus = {};

  while (Date.now() < deadline) {
    const res = await request.get(url, { timeout: 30_000, failOnStatusCode: false });
    const txt = ((await res.text()) ?? "").trim();
    last = {} as DaemonAjaxStatus;
    try {
      last = txt ? (JSON.parse(txt) as DaemonAjaxStatus) : {};
    } catch {
      last = { ok: false, lastError: `non-JSON: ${txt.slice(0, 200)}` };
    }
    if (last.mqttConnected === true && res.status() >= 200 && res.status() < 300) {
      return last;
    }
    await sleepMs(pollMs);
  }
  return last;
}
