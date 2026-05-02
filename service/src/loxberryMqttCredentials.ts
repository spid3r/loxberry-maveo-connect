/**
 * Resolve LoxBerry Mosquitto / MQTT broker login the same way as loxberry-api-abfall-io
 * (`src-ts/lib/mqtt-publisher.ts`): `config/system/general.json` (LoxBerry 3), then several
 * `cred.json` paths, then legacy `general.cfg` INI. Without this, only reading
 * `config/plugins/mqttgateway/cred.json` misses LB3’s primary `Mqtt` block in general.json.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type LoxBerryResolvedBroker = {
  host: string;
  port: number;
  user: string;
  password: string;
  source: string;
};

function readBrokerFields(raw: Record<string, unknown>): Omit<LoxBerryResolvedBroker, "source"> | null {
  const lower: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    lower[k.toLowerCase()] = v;
  }
  const hostRaw = lower.brokerhost ?? lower.host ?? lower.brokeraddress;
  if (!hostRaw) return null;
  let host = String(hostRaw);
  let port = Number(lower.brokerport ?? lower.port ?? 1883);
  if (host.includes(":")) {
    const [h, p] = host.split(":");
    host = h;
    if (p) port = Number(p);
  }
  if (!Number.isFinite(port)) port = 1883;
  const user = String(lower.brokeruser ?? lower.user ?? "");
  const password = String(lower.brokerpass ?? lower.pass ?? lower.password ?? "");
  return { host, port, user, password };
}

/** MQTT Gateway `cred.json` often has only `Credentials.{brokeruser,brokerpass}` (no host). */
function readCredentialsBlockUserPass(raw: Record<string, unknown>): { user: string; password: string } | null {
  const block = (raw.Credentials ?? raw.credentials) as Record<string, unknown> | undefined;
  if (!block || typeof block !== "object") return null;
  const lower: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(block)) {
    lower[k.toLowerCase()] = v;
  }
  const user = String(lower.brokeruser ?? lower.user ?? "").trim();
  const password = String(lower.brokerpass ?? lower.pass ?? lower.password ?? "").trim();
  if (user === "" && password === "") return null;
  return { user, password };
}

function parseIniSection(text: string, section: string): Record<string, string> | null {
  const lines = text.split(/\r?\n/);
  let inSection = false;
  const out: Record<string, string> = {};
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("[")) {
      inSection = line.toLowerCase() === `[${section.toLowerCase()}]`;
      continue;
    }
    if (!inSection || line === "" || line.startsWith("#") || line.startsWith(";")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim().toLowerCase();
    const value = line.slice(eq + 1).trim().replace(/^"(.*)"$/, "$1");
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Same probe order as {@link https://github.com/spid3r/loxberry-api-abfall-io/blob/main/src-ts/lib/mqtt-publisher.ts loxberry-api-abfall-io `loadLoxBerryBrokerCredentials`}.
 */
export function loadLoxBerryBrokerCredentials(lbhomedir: string): LoxBerryResolvedBroker | null {
  if (!lbhomedir.trim()) return null;

  const generalJson = join(lbhomedir, "config", "system", "general.json");
  try {
    if (existsSync(generalJson)) {
      const raw = JSON.parse(readFileSync(generalJson, "utf8")) as Record<string, unknown>;
      const mqtt = (raw.Mqtt ?? raw.mqtt ?? raw.MQTT) as Record<string, unknown> | undefined;
      if (mqtt && typeof mqtt === "object") {
        const broker = readBrokerFields(mqtt);
        if (broker) {
          return { ...broker, source: generalJson };
        }
      }
    }
  } catch {
    /* ignore */
  }

  const credentialFiles = [
    join(lbhomedir, "system", "storage", "mqtt", "cred.json"),
    join(lbhomedir, "data", "system", "storage", "mqtt", "cred.json"),
    join(lbhomedir, "data", "system", "mqtt", "cred.json"),
    join(lbhomedir, "data", "plugins", "mqttgateway", "cred.json"),
    join(lbhomedir, "config", "plugins", "mqttgateway", "cred.json"),
  ];
  for (const file of credentialFiles) {
    try {
      if (!existsSync(file)) continue;
      const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
      const broker =
        readBrokerFields(raw) ??
        readBrokerFields((raw.Mqtt ?? raw.mqtt ?? {}) as Record<string, unknown>);
      if (broker) {
        return { ...broker, source: file };
      }
      const credOnly = readCredentialsBlockUserPass(raw);
      if (credOnly) {
        return {
          host: "127.0.0.1",
          port: 1883,
          user: credOnly.user,
          password: credOnly.password,
          source: file,
        };
      }
    } catch {
      /* ignore */
    }
  }

  for (const cfg of [join(lbhomedir, "config", "system", "general.cfg"), join(lbhomedir, "system", "general.cfg")]) {
    try {
      if (!existsSync(cfg)) continue;
      const text = readFileSync(cfg, "utf8");
      const section = parseIniSection(text, "MQTT") ?? parseIniSection(text, "Mqtt");
      if (section) {
        const broker = readBrokerFields(section as unknown as Record<string, unknown>);
        if (broker) {
          return { ...broker, source: cfg };
        }
      }
    } catch {
      /* ignore */
    }
  }

  return null;
}
