import type http from "node:http";
import {
  createMaveoConnectStickClientFromEnv,
  type GarageDoorCommand,
  listMaveoConnectSticks,
  type MaveoThingSummary,
  maveoDoorPositionLabel,
  type MaveoDoorPosition,
  type MaveoStickStateUpdate,
  type MqttSessionLostEvent,
} from "maveo-connect-stick-client";
import { loadSettingsFile, normalizeMaveoAuthDefaults, settingsToMaveoEnv, type PluginSettings } from "./settings.js";
import type { Logger } from "./logger.js";
import type { StickClientPort } from "./stickClientPort.js";

export type DaemonMutableState = {
  connectedAtMs: number | null;
  lastStick: MaveoStickStateUpdate | undefined;
  lastStickAt: number | null;
  lastDoor: MaveoDoorPosition | undefined;
  lastLight: boolean | undefined;
  lastError: string | null;
  lastSessionLoss: MqttSessionLostEvent | null;
};

export function writeJson(res: http.ServerResponse, code: number, body: unknown) {
  const s = JSON.stringify(body);
  res.writeHead(code, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(s) });
  res.end(s);
}

/**
 * Long-poll / “push-style” updates for the admin Status page.
 *
 * WebSockets would need a browser-visible URL (daemon binds 127.0.0.1) or an Apache
 * `mod_proxy_wstunnel` hop — fragile on LoxBerry. Instead we hold `GET /api/status/wait`
 * open until the compact status signature changes (or timeout), then return JSON.
 * The PHP UI proxies that with cURL; the browser uses `fetch` + `credentials: same-origin`.
 *
 * `_streamRev` monotonically increases only when door / MQTT / errors / readiness change.
 */
let statusStreamRev = 0;
let lastStatusSig = "";
type StatusWaiter = {
  since: number;
  res: http.ServerResponse;
  timer?: ReturnType<typeof setTimeout>;
  settled: boolean;
};
const statusWaiters: StatusWaiter[] = [];

function statusSignature(snapshot: Record<string, unknown>): string {
  return JSON.stringify({
    transport: snapshot.transport,
    mqttConnected: snapshot.mqttConnected,
    doorPosition: snapshot.doorPosition,
    doorLabel: snapshot.doorLabel,
    lightOn: snapshot.lightOn,
    lastError: snapshot.lastError,
    stickSerial: snapshot.stickSerial,
    settingsOk: snapshot.settingsOk,
    clientReady: snapshot.clientReady,
    connectedAtMs: snapshot.connectedAtMs,
    sessionLoss: snapshot.sessionLoss,
  });
}

/** Attach the current stream revision without creating a new one. */
export function attachStreamRev(snapshot: Record<string, unknown>): Record<string, unknown> {
  return { ...snapshot, _streamRev: statusStreamRev };
}

/**
 * Call from `service.ts` whenever `mutable` / transport may have changed. Bumps
 * `_streamRev` and wakes `/api/status/wait` clients only when the signature changes.
 */
export function pushStatusIfChanged(snapshot: Record<string, unknown>): void {
  const sig = statusSignature(snapshot);
  if (sig === lastStatusSig) return;
  lastStatusSig = sig;
  statusStreamRev += 1;
  const payload: Record<string, unknown> = { ...snapshot, _streamRev: statusStreamRev };

  const still: StatusWaiter[] = [];
  for (const w of statusWaiters) {
    if (w.settled) continue;
    if (statusStreamRev > w.since) {
      w.settled = true;
      if (w.timer) clearTimeout(w.timer);
      if (!w.res.headersSent && !w.res.writableEnded) {
        const s = JSON.stringify(payload);
        w.res.writeHead(200, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(s) });
        w.res.end(s);
      }
    } else {
      still.push(w);
    }
  }
  statusWaiters.length = 0;
  statusWaiters.push(...still);
}

/** Daemon reload / shutdown: drop waiters so PHP cURL returns and the UI can reconnect. */
export function resetStatusStreamState(): void {
  lastStatusSig = "";
  statusStreamRev += 1;
  for (const w of statusWaiters) {
    if (w.settled) continue;
    w.settled = true;
    if (w.timer) clearTimeout(w.timer);
    try {
      if (!w.res.headersSent && !w.res.writableEnded) {
        writeJson(w.res, 200, { _streamRev: statusStreamRev, waitAborted: true });
      }
    } catch {
      /* ignore */
    }
  }
  statusWaiters.length = 0;
}

export function parseBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        const o = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        resolve(typeof o === "object" && o !== null ? o : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

export function authOk(req: http.IncomingMessage, apiToken: string): boolean {
  const h = req.headers["x-maveo-token"];
  const tok = typeof h === "string" ? h : h?.[0];
  return !!apiToken && tok === apiToken;
}

export function buildStatus(
  client: StickClientPort | undefined,
  settings: PluginSettings,
  maveoEnv: NodeJS.ProcessEnv,
  mutable: DaemonMutableState,
): Record<string, unknown> {
  const { connectedAtMs, lastStick, lastStickAt, lastDoor, lastLight, lastError, lastSessionLoss } = mutable;

  let doorLabel: string | null = null;
  try {
    if (lastDoor !== undefined) doorLabel = maveoDoorPositionLabel(lastDoor);
  } catch {
    doorLabel = null;
  }

  let stickSerial: string | undefined;
  if (client) {
    try {
      stickSerial = client.stickSerial(maveoEnv);
    } catch {
      stickSerial = settings.maveo.thingName || undefined;
    }
  } else {
    stickSerial = settings.maveo.thingName || undefined;
  }

  const settingsOk = !!(
    settings.maveo.email &&
    settings.maveo.password &&
    settings.maveo.cognitoIdentityPoolId &&
    settings.maveo.thingName
  );

  return {
    transport: client ? client.getMqttTransportState() : "disconnected",
    mqttConnected: client ? client.isMqttConnected() : false,
    connectedAtMs,
    lastStick,
    lastStickAt,
    doorPosition: lastDoor ?? null,
    doorLabel,
    lightOn: lastLight ?? null,
    backoffUntilMs: client ? client.getAutoReclaimBackoffUntilMs() : 0,
    lastError: lastError ?? (client ? null : "Settings unvollständig — bitte in der Plugin-Verwaltung speichern."),
    sessionLoss: lastSessionLoss
      ? {
          intentionalDisconnect: lastSessionLoss.intentionalDisconnect,
          suspectedRemoteSessionTakeover: lastSessionLoss.suspectedRemoteSessionTakeover,
        }
      : null,
    stickSerial: stickSerial ?? null,
    settingsOk,
    clientReady: !!client,
  };
}

async function executeMaveoProbe(
  deps: DaemonRequestDeps,
  body: Record<string, unknown>,
): Promise<{ things: MaveoThingSummary[]; usedEmail: string }> {
  const configPath = process.env.MAVOECONNECT_CONFIG?.trim();
  if (!configPath) throw new Error("MAVOECONNECT_CONFIG unset");

  const disk = normalizeMaveoAuthDefaults(loadSettingsFile(configPath));

  const emailRaw = typeof body.email === "string" ? body.email.trim() : "";
  const email = emailRaw !== "" ? emailRaw : disk.maveo.email.trim();

  const pwdProvided = typeof body.password === "string";
  let password = pwdProvided ? (body.password as string) : disk.maveo.password;
  if (password.trim() === "") password = disk.maveo.password;

  if (!email.trim() || !password) {
    throw Object.assign(new Error("E-Mail und gültiges Passwort erforderlich."), { code: "MISSING_CREDENTIALS" });
  }

  /** Allow ad-hoc overrides for test-before-save: lets the user try EU vs US, prod vs test
   * without first persisting a (potentially wrong) config to settings.json. */
  const pickStr = (key: string): string | undefined => {
    const v = body[key];
    return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
  };
  const overrides = {
    cognitoIdentityPoolId: pickStr("cognitoIdentityPoolId"),
    cognitoClientId: pickStr("cognitoClientId"),
    region: pickStr("region"),
    iotHostname: pickStr("iotHostname"),
    mqttWssSigning: pickStr("mqttWssSigning"),
    useTestEndpoints:
      typeof body.useTestEndpoints === "boolean"
        ? body.useTestEndpoints
        : body.useTestEndpoints === "true" || body.useTestEndpoints === 1
          ? true
          : body.useTestEndpoints === "false" || body.useTestEndpoints === 0
            ? false
            : undefined,
  };

  const merged: PluginSettings = {
    ...disk,
    maveo: {
      ...disk.maveo,
      email: email.trim(),
      password,
      ...(overrides.cognitoIdentityPoolId ? { cognitoIdentityPoolId: overrides.cognitoIdentityPoolId } : {}),
      ...(overrides.cognitoClientId ? { cognitoClientId: overrides.cognitoClientId } : {}),
      ...(overrides.region ? { region: overrides.region } : {}),
      ...(overrides.iotHostname ? { iotHostname: overrides.iotHostname } : {}),
      ...(overrides.mqttWssSigning ? { mqttWssSigning: overrides.mqttWssSigning } : {}),
      ...(overrides.useTestEndpoints !== undefined ? { useTestEndpoints: overrides.useTestEndpoints } : {}),
    },
  };

  deps.log.info("Maveo probe (login + listMaveoConnectSticks)", {
    overrides: Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined)),
  });
  const maveoEnv = settingsToMaveoEnv(merged, deps.getRuntimeEnv());
  const probe = createMaveoConnectStickClientFromEnv(maveoEnv, {
    blueFiRspPollIntervalMs: merged.advanced?.blueFiRspPollMs,
  });
  /**
   * `listMaveoConnectSticks` (`iot:ListPrincipalThings` with the Cognito identity as
   * principal) returns ONLY sticks the calling user actually owns — typically 1–3
   * entries. The legacy `client.listThings()` fell back to account-wide
   * `iot:ListThings`, which under the Marantec policy returns every stick the
   * upstream Cognito identity pool can see (often >100 unrelated entries) and is
   * useless for a "pick your stick" dropdown.
   */
  const session = await probe.login();
  const stickNames = await listMaveoConnectSticks(session);
  const things: MaveoThingSummary[] = stickNames.map((thingName) => ({ thingName, attributes: {} }));

  return { things, usedEmail: email.trim() };
}

export type DaemonRequestDeps = {
  getApiToken: () => string;
  /** Current plugin settings snapshot (daemon may reload file later via service). */
  getSettings: () => PluginSettings;
  /** Typically `process.env` — merged with refreshed `settings.json` for ephemeral AWS calls like things/list. */
  getRuntimeEnv: () => NodeJS.ProcessEnv;
  getMaveoEnv: () => NodeJS.ProcessEnv;
  /**
   * Returns the active stick client, or `undefined` on a fresh install where
   * `settings.json` lacks the credentials needed to construct it. Action endpoints
   * fall through to a 503-style response in that case; status/log/probe still work.
   */
  getClient: () => StickClientPort | undefined;
  mutable: DaemonMutableState;
  bindStickState: () => void;
  log: Logger & { getRecentLines(maxLines?: number): string[] };
  /** Trigger settings reload from disk and rebuild client + reconnect; used by /api/reload + UI auto-restart hook. */
  reloadFromDisk?: () => Promise<void>;
};

/** Single HTTP handler (auth + routing); production wired from `service.ts`. */
export function createDaemonRequestHandler(deps: DaemonRequestDeps) {
  const allowedDoor: GarageDoorCommand[] = ["stop", "open", "close", "ventilate"];

  return async function handleDaemonRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    if (!authOk(req, deps.getApiToken())) {
      writeJson(res, 401, { error: "unauthorized" });
      return;
    }

    const settings = deps.getSettings();
    const maveoEnv = deps.getMaveoEnv();
    const client = deps.getClient();

    /** 503 when an action endpoint runs without credentials populated; status/log/probe still work. */
    const requireClient = (): StickClientPort | null => {
      if (client) return client;
      writeJson(res, 503, {
        ok: false,
        error: "client_not_ready",
        message: "Maveo-Zugangsdaten fehlen — bitte in den Einstellungen speichern, dann erneut versuchen.",
      });
      return null;
    };

    try {
      if (req.method === "GET" && url.pathname === "/api/status") {
        writeJson(res, 200, attachStreamRev(buildStatus(client, settings, maveoEnv, deps.mutable)));
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/status/wait") {
        const sinceRaw = Number(url.searchParams.get("rev"));
        const since = Number.isFinite(sinceRaw) ? Math.floor(sinceRaw) : 0;
        const snapshotNow = attachStreamRev(buildStatus(client, settings, maveoEnv, deps.mutable));
        const currentRev = typeof snapshotNow._streamRev === "number" ? snapshotNow._streamRev : statusStreamRev;
        if (currentRev > since) {
          writeJson(res, 200, snapshotNow);
          return;
        }

        const timeoutRaw = Number(url.searchParams.get("timeoutMs"));
        const timeoutMs = Number.isFinite(timeoutRaw)
          ? Math.min(120_000, Math.max(5_000, Math.floor(timeoutRaw)))
          : 28_000;

        const entry: StatusWaiter = { since, res, settled: false };

        const settle = (body: Record<string, unknown>) => {
          if (entry.settled) return;
          entry.settled = true;
          if (entry.timer) clearTimeout(entry.timer);
          const idx = statusWaiters.indexOf(entry);
          if (idx >= 0) statusWaiters.splice(idx, 1);
          if (!res.headersSent && !res.writableEnded) {
            writeJson(res, 200, body);
          }
        };

        entry.timer = setTimeout(() => {
          settle(attachStreamRev(buildStatus(client, settings, maveoEnv, deps.mutable)));
        }, timeoutMs);

        req.once("aborted", () => {
          entry.settled = true;
          if (entry.timer) clearTimeout(entry.timer);
          const idx = statusWaiters.indexOf(entry);
          if (idx >= 0) statusWaiters.splice(idx, 1);
        });

        statusWaiters.push(entry);
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/log/recent") {
        const limRaw = Number(url.searchParams.get("limit"));
        const limit = Number.isFinite(limRaw)
          ? Math.min(520, Math.max(20, Math.floor(limRaw)))
          : 380;
        const lines = deps.log.getRecentLines(limit);
        writeJson(res, 200, { ok: true, lines, logLevel: settings.logging?.level ?? "info" });
        return;
      }

      if (
        req.method === "POST" &&
        (url.pathname === "/api/maveo/probe" || url.pathname === "/api/things/list")
      ) {
        try {
          const body = await parseBody(req);
          const { things, usedEmail } = await executeMaveoProbe(deps, body);
          writeJson(res, 200, {
            ok: true,
            loginOk: true,
            message: "Anmeldung bei Maveo bestätigt.",
            things,
            thingCount: things.length,
            email: usedEmail,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const code = e && typeof e === "object" && "code" in e ? String((e as { code?: string }).code ?? "") : "";
          if (code === "MISSING_CREDENTIALS" || msg.includes("E-Mail und gültiges Passwort")) {
            writeJson(res, 400, {
              ok: false,
              loginOk: false,
              error: "missing_credentials",
              message: msg,
            });
            return;
          }
          deps.log.warn("maveo/probe failed", { error: msg });
          writeJson(res, 500, { ok: false, loginOk: false, error: msg });
        }
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/reload") {
        if (!deps.reloadFromDisk) {
          writeJson(res, 501, { ok: false, error: "reload not wired" });
          return;
        }
        try {
          await deps.reloadFromDisk();
          writeJson(res, 200, {
            ok: true,
            message: "Settings reloaded; client reconnecting.",
            status: buildStatus(deps.getClient(), deps.getSettings(), deps.getMaveoEnv(), deps.mutable),
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          deps.log.error("reload failed", { error: msg });
          writeJson(res, 500, { ok: false, error: msg });
        }
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/reconnect") {
        const c = requireClient();
        if (!c) return;
        await c.recoverMqttSession();
        deps.bindStickState();
        deps.mutable.connectedAtMs = Date.now();
        writeJson(res, 200, { ok: true, status: buildStatus(c, settings, maveoEnv, deps.mutable) });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/refresh-state") {
        const c = requireClient();
        if (!c) return;
        await c.requestDoorStatus();
        await c.requestLightState();
        writeJson(res, 200, { ok: true, status: buildStatus(c, settings, maveoEnv, deps.mutable) });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/light") {
        const c = requireClient();
        if (!c) return;
        const body = await parseBody(req);
        const on = body.on === true || body.on === 1 || body.on === "1";
        await c.publishLight(on);
        writeJson(res, 200, { ok: true });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/door") {
        const c = requireClient();
        if (!c) return;
        const body = await parseBody(req);
        const cmd = String(body.command ?? "");
        if (!allowedDoor.includes(cmd as GarageDoorCommand)) {
          writeJson(res, 400, { error: "invalid command" });
          return;
        }
        await c.publishGarageDoor(cmd as GarageDoorCommand);
        writeJson(res, 200, { ok: true });
        return;
      }

      writeJson(res, 404, { error: "not found" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      deps.log.error("HTTP handler error", { error: msg });
      writeJson(res, 500, { error: msg });
    }
  };
}
