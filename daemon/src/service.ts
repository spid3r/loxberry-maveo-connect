import http from "node:http";
import { join } from "node:path";
import {
  createMaveoConnectStickClientFromEnv,
  mergeAutomaticMqttReclaimOptionsFromEnv,
  maveoDoorPositionLabel,
  type GarageDoorCommand,
  type MaveoDoorPosition,
  type MaveoStickStateUpdate,
  type MqttSessionLostEvent,
} from "maveo-connect-stick-client";
import { loadSettingsFile, readApiToken, settingsToMaveoEnv, type PluginSettings } from "./settings.js";
import { createLogger, type Logger } from "./logger.js";
import { MqttForwarder } from "./mqttForward.js";

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

let settings = loadSettingsFile(requireEnv("MAVOECONNECT_CONFIG", CONFIG_PATH));
const logFile = join(LOG_DIR || "/tmp", "daemon.log");
let log = createLogger(settings.logging?.level ?? "info", logFile);
const forwarder = new MqttForwarder(log);

let maveoEnv = settingsToMaveoEnv(settings, process.env);
let apiToken = "";

let client = createMaveoConnectStickClientFromEnv(maveoEnv, {
  blueFiRspPollIntervalMs: settings.advanced?.blueFiRspPollMs,
});

let stopAutoReclaim: (() => void) | undefined;
let unstick: () => void = () => {};
let connectedAtMs: number | null = null;
let lastStick: MaveoStickStateUpdate | undefined;
let lastStickAt: number | null = null;
let lastDoor: MaveoDoorPosition | undefined;
let lastLight: boolean | undefined;
let lastError: string | null = null;
let lastSessionLoss: MqttSessionLostEvent | null = null;

function bindStickState() {
  unstick();
  unstick = client.onStickState((u) => {
    lastStick = u;
    lastStickAt = Date.now();
    if (u.doorPosition !== undefined) lastDoor = u.doorPosition;
    if (u.lightOn !== undefined) lastLight = u.lightOn;
    forwarder.schedulePublish(u.doorPosition, u.lightOn);
    log.debug("stick state", {
      door: u.doorPosition !== undefined ? maveoDoorPositionLabel(u.doorPosition) : undefined,
      light: u.lightOn,
    });
  });
}

function wireClient() {
  stopAutoReclaim?.();
  stopAutoReclaim = client.enableAutomaticMqttReclaim(
    mergeAutomaticMqttReclaimOptionsFromEnv(maveoEnv, {
      sessionContention: settings.advanced?.mqttSessionContention !== false,
      onRecovered: () => {
        log.info("MQTT session recovered; rebinding stick state listener");
        bindStickState();
      },
    }),
  );

  client.onMqttSessionLost((ev) => {
    lastSessionLoss = ev;
    log.warn("MQTT session lost", {
      intentionalDisconnect: ev.intentionalDisconnect,
      suspectedRemoteSessionTakeover: ev.suspectedRemoteSessionTakeover,
    });
  });

  client.onMaveoLifecycle((e) => {
    if (e.kind === "manual_recover_finished" && !e.ok) {
      lastError = e.error instanceof Error ? e.error.message : String(e.error);
      log.error("Manual recover failed", { error: lastError });
    }
    if (e.kind === "manual_recover_finished" && e.ok) {
      lastError = null;
    }
  });
}

async function connectMaveo(): Promise<void> {
  lastError = null;
  const m = settings.maveo;
  if (!m.email || !m.password || !m.cognitoIdentityPoolId || !m.thingName) {
    lastError = "Incomplete settings: email, password, Cognito pool, and stick serial are required.";
    log.error(lastError);
    return;
  }

  try {
    log.info("Logging in to Maveo…");
    await client.login();
    await client.connectMqtt();
    await client.subscribeBlueFiResponses();
    bindStickState();
    connectedAtMs = Date.now();
    log.info("Maveo MQTT connected");
    await client.requestDoorStatus();
    await client.requestLightState();
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
    log.error("Maveo connect failed", { error: lastError });
    connectedAtMs = null;
  }
}

function json(res: http.ServerResponse, code: number, body: unknown) {
  const s = JSON.stringify(body);
  res.writeHead(code, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(s) });
  res.end(s);
}

function parseBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
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

function authOk(req: http.IncomingMessage): boolean {
  const h = req.headers["x-maveo-token"];
  const tok = typeof h === "string" ? h : h?.[0];
  return !!apiToken && tok === apiToken;
}

function buildStatus() {
  let doorLabel: string | null = null;
  try {
    if (lastDoor !== undefined) doorLabel = maveoDoorPositionLabel(lastDoor);
  } catch {
    doorLabel = null;
  }
  let stickSerial: string | undefined;
  try {
    stickSerial = client.stickSerial(maveoEnv);
  } catch {
    stickSerial = settings.maveo.thingName || undefined;
  }

  return {
    transport: client.getMqttTransportState(),
    mqttConnected: client.isMqttConnected(),
    connectedAtMs,
    lastStick,
    lastStickAt,
    doorPosition: lastDoor ?? null,
    doorLabel,
    lightOn: lastLight ?? null,
    backoffUntilMs: client.getAutoReclaimBackoffUntilMs(),
    lastError,
    sessionLoss: lastSessionLoss
      ? {
          intentionalDisconnect: lastSessionLoss.intentionalDisconnect,
          suspectedRemoteSessionTakeover: lastSessionLoss.suspectedRemoteSessionTakeover,
        }
      : null,
    stickSerial: stickSerial ?? null,
    settingsOk: !!(settings.maveo.email && settings.maveo.password && settings.maveo.cognitoIdentityPoolId && settings.maveo.thingName),
  };
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");

  if (!authOk(req)) {
    json(res, 401, { error: "unauthorized" });
    return;
  }

  try {
    if (req.method === "GET" && url.pathname === "/api/status") {
      json(res, 200, buildStatus());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/reconnect") {
      await client.recoverMqttSession();
      bindStickState();
      connectedAtMs = Date.now();
      json(res, 200, { ok: true, status: buildStatus() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/refresh-state") {
      await client.requestDoorStatus();
      await client.requestLightState();
      json(res, 200, { ok: true, status: buildStatus() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/light") {
      const body = await parseBody(req);
      const on = body.on === true || body.on === 1 || body.on === "1";
      await client.publishLight(on);
      json(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/door") {
      const body = await parseBody(req);
      const cmd = String(body.command ?? "");
      const allowed: GarageDoorCommand[] = ["stop", "open", "close", "ventilate"];
      if (!allowed.includes(cmd as GarageDoorCommand)) {
        json(res, 400, { error: "invalid command" });
        return;
      }
      await client.publishGarageDoor(cmd as GarageDoorCommand);
      json(res, 200, { ok: true });
      return;
    }

    json(res, 404, { error: "not found" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error("HTTP handler error", { error: msg });
    json(res, 500, { error: msg });
  }
}

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

  const server = http.createServer((req, res) => {
    void handleRequest(req, res);
  });

  server.listen(port, host, () => {
    log.info(`Maveo Connect daemon API listening on http://${host}:${port}`);
  });

  process.on("uncaughtException", (e) => {
    log.error("uncaughtException", { error: String(e) });
  });
  process.on("unhandledRejection", (e) => {
    log.error("unhandledRejection", { error: String(e) });
  });

  wireClient();
  void connectMaveo();

  const shutdown = async () => {
    log.info("Shutting down…");
    forwarder.disconnect();
    stopAutoReclaim?.();
    unstick();
    try {
      await client.disconnectMqtt();
    } catch {
      /* ignore */
    }
    server.close();
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}

main();
