import { readFileSync, existsSync } from "node:fs";
import { MAVEO_DEFAULT_STACK } from "./maveoStackDefaults.js";

export type LogLevelName = "error" | "warn" | "info" | "debug";

export type PluginSettings = {
  general?: {
    /** Pinned admin UI language ("de" / "en"); empty = auto-detect (cookie / browser / system). */
    language?: string;
  };
  maveo: {
    email: string;
    password: string;
    cognitoIdentityPoolId: string;
    cognitoClientId?: string;
    region?: string;
    /** Reserved for the future: Marantec test-stack support. The upstream library does not
     *  branch on this flag (it just uses whatever IoT hostname / region it gets); the field
     *  is preserved on disk for forward-compat with custom test deployments. */
    useTestEndpoints?: boolean;
    thingName?: string;
    iotHostname?: string;
    mqttWssSigning?: string;
  };
  advanced?: {
    blueFiRspPollMs?: number;
    mqttSessionContention?: boolean;
    mqttContentionBurstWindowMs?: number | null;
    mqttContentionBurstThreshold?: number | null;
    mqttContentionBackoffMs?: number | null;
    mqttReclaimMaxAttempts?: number | null;
    mqttReclaimDelayMs?: number | null;
  };
  daemon?: {
    port?: number;
    listenHost?: string;
  };
  logging?: {
    level?: LogLevelName;
  };
  mqttForward?: {
    enabled?: boolean;
    brokerUrl?: string;
    username?: string;
    password?: string;
    topicPrefix?: string;
  };
};

const defaultSettings = (): PluginSettings => ({
  general: { language: "" },
  maveo: {
    email: "",
    password: "",
    /** EU-central-1 prod stack defaults — see `maveoStackDefaults.ts` for rationale. */
    cognitoIdentityPoolId: MAVEO_DEFAULT_STACK.cognitoIdentityPoolId,
    cognitoClientId: MAVEO_DEFAULT_STACK.cognitoClientId,
    region: MAVEO_DEFAULT_STACK.region,
    useTestEndpoints: false,
    thingName: "",
    iotHostname: MAVEO_DEFAULT_STACK.iotHostname,
    mqttWssSigning: "",
  },
  advanced: {
    blueFiRspPollMs: 400,
    mqttSessionContention: true,
  },
  daemon: {
    port: 47832,
    listenHost: "127.0.0.1",
  },
  logging: { level: "info" },
  mqttForward: {
    enabled: false,
    brokerUrl: "mqtt://127.0.0.1:1883",
    username: "",
    password: "",
    topicPrefix: "maveo",
  },
});

export function loadSettingsFile(path: string): PluginSettings {
  const base = defaultSettings();
  if (!existsSync(path)) {
    return base;
  }
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as Partial<PluginSettings>;
  return normalizeMaveoAuthDefaults(deepMerge(base, parsed));
}

/**
 * Fill blank cloud fields with the EU-central-1 prod stack baked into the plugin.
 * Empty strings count as blank — that way legacy v1.0.x `settings.json` files (which
 * shipped `region=us-west-2` but no IoT hostname) automatically migrate to the new
 * default the next time the daemon reads them, without losing user overrides.
 */
export function normalizeMaveoAuthDefaults(settings: PluginSettings): PluginSettings {
  const m = { ...settings.maveo };
  if (!m.cognitoIdentityPoolId?.trim()) {
    m.cognitoIdentityPoolId = MAVEO_DEFAULT_STACK.cognitoIdentityPoolId;
  }
  if (!m.cognitoClientId?.trim()) {
    m.cognitoClientId = MAVEO_DEFAULT_STACK.cognitoClientId;
  }
  if (!m.region?.trim()) {
    m.region = MAVEO_DEFAULT_STACK.region;
  }
  if (!m.iotHostname?.trim()) {
    m.iotHostname = MAVEO_DEFAULT_STACK.iotHostname;
  }
  return { ...settings, maveo: m };
}

function deepMerge(a: PluginSettings, b: Partial<PluginSettings>): PluginSettings {
  return {
    general: { ...a.general, ...(b.general ?? {}) },
    maveo: { ...a.maveo, ...(b.maveo ?? {}) },
    advanced: { ...a.advanced, ...(b.advanced ?? {}) },
    daemon: { ...a.daemon, ...(b.daemon ?? {}) },
    logging: { ...a.logging, ...(b.logging ?? {}) },
    mqttForward: { ...a.mqttForward, ...(b.mqttForward ?? {}) },
  };
}

/** Build an env object for `createMaveoConnectStickClientFromEnv` and reclaim helpers. */
export function settingsToMaveoEnv(settings: PluginSettings, base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const m = settings.maveo;
  const adv = settings.advanced ?? {};
  const out: NodeJS.ProcessEnv = { ...base };

  const set = (k: string, v: string | undefined) => {
    if (v !== undefined && v !== "") out[k] = v;
    else delete out[k];
  };

  set("MAVEO_EMAIL", m.email);
  set("MAVEO_PASSWORD", m.password);
  set("MAVEO_COGNITO_IDENTITY_POOL_ID", m.cognitoIdentityPoolId || MAVEO_DEFAULT_STACK.cognitoIdentityPoolId);
  set("MAVEO_COGNITO_CLIENT_ID", m.cognitoClientId || MAVEO_DEFAULT_STACK.cognitoClientId);
  set("MAVEO_REGION", m.region || MAVEO_DEFAULT_STACK.region);
  set("MAVEO_USE_TEST_ENDPOINTS", m.useTestEndpoints ? "true" : "false");
  set("MAVEO_THING_NAME", m.thingName);
  set("MAVEO_MQTT_CLIENT_ID", m.thingName);
  set("MAVEO_IOT_HOSTNAME", m.iotHostname || MAVEO_DEFAULT_STACK.iotHostname);
  set("MAVEO_MQTT_WSS_SIGNING", m.mqttWssSigning);

  if (adv.blueFiRspPollMs != null && adv.blueFiRspPollMs > 0) {
    set("MAVEO_BLUEFI_RSP_POLL_MS", String(adv.blueFiRspPollMs));
  }

  if (adv.mqttSessionContention === false) {
    set("MAVEO_MQTT_SESSION_CONTENTION", "false");
  } else if (adv.mqttSessionContention === true) {
    set("MAVEO_MQTT_SESSION_CONTENTION", "true");
  }

  if (adv.mqttContentionBurstWindowMs != null) {
    set("MAVEO_MQTT_CONTENTION_BURST_WINDOW_MS", String(adv.mqttContentionBurstWindowMs));
  }
  if (adv.mqttContentionBurstThreshold != null) {
    set("MAVEO_MQTT_CONTENTION_BURST_THRESHOLD", String(adv.mqttContentionBurstThreshold));
  }
  if (adv.mqttContentionBackoffMs != null) {
    set("MAVEO_MQTT_CONTENTION_BACKOFF_MS", String(adv.mqttContentionBackoffMs));
  }
  if (adv.mqttReclaimMaxAttempts != null) {
    set("MAVEO_MQTT_RECLAIM_MAX_ATTEMPTS", String(adv.mqttReclaimMaxAttempts));
  }
  if (adv.mqttReclaimDelayMs != null) {
    set("MAVEO_MQTT_RECLAIM_DELAY_MS", String(adv.mqttReclaimDelayMs));
  }

  return out;
}

export function readApiToken(secretPath: string): string {
  if (!existsSync(secretPath)) {
    throw new Error(`Missing API secret file: ${secretPath}`);
  }
  return readFileSync(secretPath, "utf8").trim();
}

/**
 * Maveo-related env keys the upstream library reads through `process.env` defaults
 * (e.g. `MaveoConnectStickClient.stickSerial(env = process.env)`). The factory only
 * receives our snapshot for Cognito config; everything else still defaults to
 * `process.env`, so we mirror these keys back into `process.env` after every reload
 * so calls like `subscribeBlueFiResponses()` / `requestDoorStatus()` find the
 * Connect Stick serial without us having to thread a `stickId` through every call.
 */
const MAVEO_PROCESS_ENV_KEYS = [
  "MAVEO_EMAIL",
  "MAVEO_PASSWORD",
  "MAVEO_COGNITO_IDENTITY_POOL_ID",
  "MAVEO_COGNITO_CLIENT_ID",
  "MAVEO_REGION",
  "MAVEO_USE_TEST_ENDPOINTS",
  "MAVEO_THING_NAME",
  "MAVEO_MQTT_CLIENT_ID",
  "MAVEO_IOT_HOSTNAME",
  "MAVEO_MQTT_WSS_SIGNING",
  "MAVEO_BLUEFI_RSP_POLL_MS",
  "MAVEO_MQTT_SESSION_CONTENTION",
  "MAVEO_MQTT_CONTENTION_BURST_WINDOW_MS",
  "MAVEO_MQTT_CONTENTION_BURST_THRESHOLD",
  "MAVEO_MQTT_CONTENTION_BACKOFF_MS",
  "MAVEO_MQTT_RECLAIM_MAX_ATTEMPTS",
  "MAVEO_MQTT_RECLAIM_DELAY_MS",
] as const;

export function applyMaveoEnvToProcess(env: NodeJS.ProcessEnv): void {
  for (const k of MAVEO_PROCESS_ENV_KEYS) {
    const v = env[k];
    if (v === undefined || v === "") delete process.env[k];
    else process.env[k] = v;
  }
}
