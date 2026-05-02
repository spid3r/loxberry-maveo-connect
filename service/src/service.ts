import http from "node:http";
import { join } from "node:path";
import {
  createMaveoConnectStickClientFromEnv,
  mergeAutomaticMqttReclaimOptionsFromEnv,
  maveoDoorPositionLabel,
  type MaveoStickStateUpdate,
} from "maveo-connect-stick-client";
import type { StickClientPort } from "./stickClientPort.js";
import {
  applyMaveoEnvToProcess,
  loadSettingsFile,
  readApiToken,
  settingsToMaveoEnv,
  type PluginSettings,
} from "./settings.js";
import { createLogger, type Logger } from "./logger.js";
import { MqttForwarder } from "./mqttForward.js";
import {
  buildStatus,
  createDaemonRequestHandler,
  type DaemonMutableState,
  pushStatusIfChanged,
  resetStatusStreamState,
} from "./daemonHttp.js";

const CONFIG_PATH = process.env.MAVOECONNECT_CONFIG ?? "";
const LOG_DIR = process.env.MAVOECONNECT_LOGDIR ?? "";
const SECRET_PATH = process.env.MAVOECONNECT_SECRET ?? "";

function requireEnv(name: string, v: string): string {
  if (!v) {
    console.error(`Missing env ${name}`);
    process.exit(1);
  }
  return v;
}

const logFile = join(LOG_DIR || "/tmp", "daemon.log");

let settings: PluginSettings = loadSettingsFile(requireEnv("MAVOECONNECT_CONFIG", CONFIG_PATH));
const log: Logger = createLogger(settings.logging?.level ?? "info", logFile);
const forwarder = new MqttForwarder(log);

let maveoEnv: NodeJS.ProcessEnv = settingsToMaveoEnv(settings, process.env);
applyMaveoEnvToProcess(maveoEnv);
let apiToken = "";

function settingsAreReady(s: PluginSettings): boolean {
  return Boolean(s.maveo.email && s.maveo.password && s.maveo.cognitoIdentityPoolId && s.maveo.thingName);
}

/**
 * Construct the stick client only when settings are populated. On a fresh install
 * `settings.json` is empty until the user saves the form once — the daemon must keep
 * running so the WebUI can probe Maveo, save credentials, then reload.
 */
function tryCreateClient(): StickClientPort | undefined {
  if (!settingsAreReady(settings)) return undefined;
  try {
    return createMaveoConnectStickClientFromEnv(maveoEnv, {
      blueFiRspPollIntervalMs: settings.advanced?.blueFiRspPollMs,
    });
  } catch (e) {
    log.error("createMaveoConnectStickClientFromEnv failed", { error: e instanceof Error ? e.message : String(e) });
    return undefined;
  }
}

let client: StickClientPort | undefined = tryCreateClient();

let stopAutoReclaim: (() => void) | undefined;
let unstick: () => void = () => {};
/**
 * `onMaveoLifecycle` in `maveo-connect-stick-client@1.0.x` lazily wires its internal
 * bridge by calling `this.onStickState(...)` synchronously, which in turn calls
 * `this.mqtt.onMessage(...)` — and the latter throws `"MaveoMqttIotClient: not connected"`
 * if MQTT is not connected yet. So we MUST register the lifecycle listener AFTER
 * `connectMqtt()` has resolved, never before. We keep the unsub handle here so we
 * can detach it cleanly on reload / shutdown.
 */
let unbindLifecycle: (() => void) | undefined;

const mutable: DaemonMutableState = {
  connectedAtMs: null,
  lastStick: undefined,
  lastStickAt: null,
  lastDoor: undefined,
  lastLight: undefined,
  lastError: null,
  lastSessionLoss: null,
};

/**
 * Same MQTT-must-be-connected caveat as `onMaveoLifecycle`: `client.onStickState(...)`
 * calls `this.mqtt.onMessage(...)` synchronously. We only call this from connectMaveo
 * (post-`connectMqtt`) and from the auto-reclaim `onRecovered` callback, so we are
 * always safe — but wrap defensively so a stray call cannot crash the daemon.
 */
/**
 * After MQTT reconnects, request fresh BlueFi reads so `mutable` / `/api/status` match the stick
 * before the next UI poll (stick updates otherwise only arrive when the device pushes).
 */
async function hydrateStickSnapshotAfterMqttRecovery(context: string): Promise<void> {
  if (!client) return;
  try {
    await client.requestDoorStatus();
    await client.requestLightState();
  } catch (e) {
    log.debug(`${context}: door/light snapshot refresh failed`, {
      error: e instanceof Error ? e.message : String(e),
    });
  }
  mutable.lastSessionLoss = null;
  mutable.lastError = null;
  pushStatusIfChanged(buildStatus(client, settings, maveoEnv, mutable));
}

function bindStickState() {
  unstick();
  unstick = () => {};
  if (!client) return;
  try {
    unstick = client.onStickState((u: MaveoStickStateUpdate) => {
      mutable.lastStick = u;
      mutable.lastStickAt = Date.now();
      if (u.doorPosition !== undefined) mutable.lastDoor = u.doorPosition;
      if (u.lightOn !== undefined) mutable.lastLight = u.lightOn;
      forwarder.schedulePublish(u.doorPosition, u.lightOn);
      log.debug("stick state", {
        door: u.doorPosition !== undefined ? maveoDoorPositionLabel(u.doorPosition) : undefined,
        light: u.lightOn,
      });
    });
  } catch (e) {
    log.warn("bindStickState deferred — MQTT not ready yet", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Pre-connect wiring: only register listeners that DO NOT depend on a live MQTT
 * connection. `enableAutomaticMqttReclaim` and `onMqttSessionLost` are safe pre-connect;
 * `onMaveoLifecycle` is NOT and is registered later in {@link bindLifecycleAfterConnect}.
 */
function wireClient() {
  stopAutoReclaim?.();
  stopAutoReclaim = undefined;
  unbindLifecycle?.();
  unbindLifecycle = undefined;
  if (!client) return;
  stopAutoReclaim = client.enableAutomaticMqttReclaim(
    mergeAutomaticMqttReclaimOptionsFromEnv(maveoEnv, {
      sessionContention: settings.advanced?.mqttSessionContention !== false,
      onRecovered: () => {
        log.info("MQTT session recovered; rebinding stick state listener");
        bindStickState();
        bindLifecycleAfterConnect();
        void hydrateStickSnapshotAfterMqttRecovery("auto-reclaim");
      },
      onSessionContentionBurst: (info) => {
        log.warn("MQTT session contention burst — auto-reclaim paused", {
          backoffUntilMs: info.backoffUntilMs,
          backoffUntilIso: new Date(info.backoffUntilMs).toISOString(),
          burstWindowMs: info.burstWindowMs,
          burstThreshold: info.burstThreshold,
          backoffAfterBurstMs: info.backoffAfterBurstMs,
          hint: "Until backoffUntil, automatic reclaim is paused; use Status → MQTT buttons or wait.",
        });
        pushStatusIfChanged(buildStatus(client, settings, maveoEnv, mutable));
      },
      onSessionContentionSkipped: (info) => {
        log.debug("MQTT auto-reclaim skipped (contention backoff active)", {
          backoffUntilMs: info.backoffUntilMs,
        });
        pushStatusIfChanged(buildStatus(client, settings, maveoEnv, mutable));
      },
    }),
  );

  client.onMqttSessionLost((ev) => {
    mutable.lastSessionLoss = ev;
    log.warn("MQTT session lost", {
      intentionalDisconnect: ev.intentionalDisconnect,
      suspectedRemoteSessionTakeover: ev.suspectedRemoteSessionTakeover,
    });
    pushStatusIfChanged(buildStatus(client, settings, maveoEnv, mutable));
  });
}

/**
 * Post-connect wiring. Must run AFTER `client.connectMqtt()` has resolved, otherwise
 * the upstream lib throws synchronously (see comment above on `unbindLifecycle`).
 * Idempotent: re-binds cleanly after a reload or auto-reclaim recovery.
 */
function bindLifecycleAfterConnect(): void {
  if (!client) return;
  unbindLifecycle?.();
  unbindLifecycle = undefined;
  try {
    const unsub = client.onMaveoLifecycle((e) => {
      if (e.kind === "manual_recover_finished" && !e.ok) {
        mutable.lastError = e.error instanceof Error ? e.error.message : String(e.error);
        log.error("Manual recover failed", { error: mutable.lastError });
        pushStatusIfChanged(buildStatus(client, settings, maveoEnv, mutable));
      }
      if (e.kind === "manual_recover_finished" && e.ok) {
        /** Full snapshot + sessionLoss clear happens in `/api/reconnect` after await; avoid double MQTT reads here. */
        mutable.lastError = null;
      }
    });
    if (typeof unsub === "function") unbindLifecycle = unsub;
  } catch (e) {
    log.warn("onMaveoLifecycle wiring deferred — MQTT not ready yet", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

async function connectMaveo(): Promise<void> {
  mutable.lastError = null;
  if (!client) {
    mutable.lastError = "Settings unvollständig — bitte E-Mail, Passwort, Cognito-Pool und Stick-Serial in den Einstellungen speichern.";
    log.warn(mutable.lastError);
    pushStatusIfChanged(buildStatus(undefined, settings, maveoEnv, mutable));
    return;
  }
  const m = settings.maveo;
  if (!m.email || !m.password || !m.cognitoIdentityPoolId || !m.thingName) {
    mutable.lastError = "Incomplete settings: email, password, Cognito pool, and stick serial are required.";
    log.error(mutable.lastError);
    pushStatusIfChanged(buildStatus(client, settings, maveoEnv, mutable));
    return;
  }

  try {
    log.info("Logging in to Maveo…");
    await client.login();
    await client.connectMqtt();
    await client.subscribeBlueFiResponses();
    bindStickState();
    bindLifecycleAfterConnect();
    mutable.connectedAtMs = Date.now();
    log.info("Maveo MQTT connected");
    await client.requestDoorStatus();
    await client.requestLightState();
  } catch (e) {
    mutable.lastError = e instanceof Error ? e.message : String(e);
    log.error("Maveo connect failed", { error: mutable.lastError });
    mutable.connectedAtMs = null;
  }
  pushStatusIfChanged(buildStatus(client, settings, maveoEnv, mutable));
}

/**
 * Re-read settings.json from disk, rebuild logger/client/forwarder, reconnect to Maveo.
 * Triggered by SIGHUP and POST /api/reload (PHP fires this after Settings save).
 */
async function reloadFromDisk(): Promise<void> {
  resetStatusStreamState();
  log.info("reloadFromDisk: re-reading settings.json");
  const fresh = loadSettingsFile(requireEnv("MAVOECONNECT_CONFIG", CONFIG_PATH));
  const newLogLevel = fresh.logging?.level ?? "info";

  if (newLogLevel !== log.level) {
    log.setLevel(newLogLevel);
    log.info("reloadFromDisk: log level changed", { level: newLogLevel });
  }

  settings = fresh;
  maveoEnv = settingsToMaveoEnv(settings, process.env);
  applyMaveoEnvToProcess(maveoEnv);

  forwarder.updateSettings(settings);

  unstick();
  unstick = () => {};
  unbindLifecycle?.();
  unbindLifecycle = undefined;
  stopAutoReclaim?.();
  stopAutoReclaim = undefined;
  if (client) {
    try {
      await client.disconnectMqtt();
    } catch {
      /* ignore */
    }
  }

  client = tryCreateClient();
  wireClient();
  await connectMaveo();
}

const handleRequest = createDaemonRequestHandler({
  getApiToken: () => apiToken,
  getSettings: (): PluginSettings => settings,
  getRuntimeEnv: () => process.env,
  getMaveoEnv: () => maveoEnv,
  getClient: () => client,
  mutable,
  bindStickState,
  log,
  reloadFromDisk,
});

function main() {
  requireEnv("MAVOECONNECT_CONFIG", CONFIG_PATH);
  requireEnv("MAVOECONNECT_SECRET", SECRET_PATH);

  try {
    apiToken = readApiToken(SECRET_PATH);
  } catch (e) {
    console.error(
      "Maveo Connect: missing api_token.txt — open the plugin settings in LoxBerry, save once, then start the daemon.",
      e,
    );
    process.exit(1);
  }

  forwarder.updateSettings(settings);

  const host = settings.daemon?.listenHost ?? "127.0.0.1";
  const port = settings.daemon?.port ?? 47832;

  /**
   * Install crash handlers FIRST, before any other code that touches the network /
   * upstream lib. The previous order let the upstream MQTT layer throw during its
   * own internal setup before we had a chance to log it; now we always see the
   * cause in `daemon.log` instead of the bare LSB stderr.
   */
  process.on("uncaughtException", (e) => {
    log.error("uncaughtException", {
      error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      stack: e instanceof Error ? e.stack : undefined,
    });
  });
  process.on("unhandledRejection", (reason) => {
    const e = reason as unknown;
    log.error("unhandledRejection", {
      error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      stack: e instanceof Error ? e.stack : undefined,
    });
  });

  log.info(`Maveo Connect daemon booting — clientReady=${client ? "yes" : "no"} stickSerial=${settings.maveo.thingName || "—"}`);

  const server = http.createServer((req, res) => {
    void handleRequest(req, res);
  });

  server.listen(port, host, () => {
    log.info(`Maveo Connect daemon API listening on http://${host}:${port}`);
  });

  wireClient();
  /** Wrap the fire-and-forget so any rejection from `connectMaveo` shows up in daemon.log
   *  rather than bubbling up to `unhandledRejection` later. `connectMaveo` is already
   *  try/catch internally; this is belt-and-braces for refactor safety. */
  connectMaveo().catch((e) => {
    log.error("connectMaveo top-level rejection", {
      error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    });
  });

  process.on("SIGHUP", () => {
    log.info("SIGHUP received — reloading settings");
    void reloadFromDisk();
  });

  const shutdown = async () => {
    log.info("Shutting down…");
    forwarder.disconnect();
    stopAutoReclaim?.();
    unbindLifecycle?.();
    unstick();
    if (client) {
      try {
        await client.disconnectMqtt();
      } catch {
        /* ignore */
      }
    }
    server.close();
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}

main();
