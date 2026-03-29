import { readFileSync, existsSync } from "node:fs";

export type LogLevelName = "error" | "warn" | "info" | "debug";

export type PluginSettings = {
  maveo: {
    email: string;
    password: string;
    cognitoIdentityPoolId: string;
    cognitoClientId?: string;
    region?: string;
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
  maveo: {
    email: "",
    password: "",
    cognitoIdentityPoolId: "",
    cognitoClientId: "",
    region: "us-west-2",
    useTestEndpoints: false,
    thingName: "",
    iotHostname: "",
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
  if (!existsSync(path)) {
    return defaultSettings();
  }
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as Partial<PluginSettings>;
  const base = defaultSettings();
  return deepMerge(base, parsed);
}

function deepMerge(a: PluginSettings, b: Partial<PluginSettings>): PluginSettings {
  return {
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
  set("MAVEO_COGNITO_IDENTITY_POOL_ID", m.cognitoIdentityPoolId);
  set("MAVEO_COGNITO_CLIENT_ID", m.cognitoClientId);
  set("MAVEO_REGION", m.region);
  set("MAVEO_USE_TEST_ENDPOINTS", m.useTestEndpoints ? "true" : "false");
  set("MAVEO_THING_NAME", m.thingName);
  set("MAVEO_MQTT_CLIENT_ID", m.thingName);
  set("MAVEO_IOT_HOSTNAME", m.iotHostname);
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
