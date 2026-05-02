import mqtt, { type IClientOptions, type MqttClient } from "mqtt";
import type { PluginSettings } from "./settings.js";
import type { Logger } from "./logger.js";
import type { MaveoDoorPosition } from "maveo-connect-stick-client";
import { maveoDoorPositionLabel } from "maveo-connect-stick-client";

/** MQTT.js default reconnect is 1s → log spam + broker hammering when auth fails. */
const FORWARD_RECONNECT_MS = 30_000;
const FORWARD_ERROR_WARN_INTERVAL_MS = 60_000;

export class MqttForwarder {
  private client: MqttClient | undefined;
  private prefix = "maveo";
  private log: Logger;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private pending: { door?: MaveoDoorPosition; light?: boolean } = {};
  /** Throttle identical forward errors: one WARN per minute, counts between. */
  private forwardErrorThrottle:
    | { signature: string; windowStartMs: number; hitsInWindow: number; lastWarnMs: number }
    | undefined;

  constructor(log: Logger) {
    this.log = log;
  }

  setLogger(log: Logger) {
    this.log = log;
  }

  updateSettings(settings: PluginSettings) {
    const mf = settings.mqttForward;
    const enabled = mf?.enabled === true;
    const url = mf?.brokerUrl?.trim() || "mqtt://127.0.0.1:1883";
    this.prefix = (mf?.topicPrefix?.trim() || "maveo").replace(/\/+$/, "");

    if (!enabled) {
      this.disconnect();
      return;
    }

    if (this.client?.connected) {
      return;
    }

    this.disconnect();
    this.forwardErrorThrottle = undefined;

    const opts: IClientOptions = {
      reconnectPeriod: FORWARD_RECONNECT_MS,
      connectTimeout: 15_000,
    };
    if (mf?.username) opts.username = mf.username;
    if (mf?.password) opts.password = mf.password;

    try {
      this.client = mqtt.connect(url, opts);
      this.client.on("connect", () => {
        this.forwardErrorThrottle = undefined;
        this.log.info("MQTT forward: connected to local broker", { url });
      });
      this.client.on("error", (e) => {
        this.logForwardBrokerError(String(e));
      });
      this.client.on("close", () => {
        this.log.debug("MQTT forward: connection closed");
      });
    } catch (e) {
      this.log.error("MQTT forward: connect failed", { error: String(e) });
    }
  }

  private logForwardBrokerError(message: string) {
    const now = Date.now();
    const t = this.forwardErrorThrottle;
    if (!t || t.signature !== message) {
      this.forwardErrorThrottle = {
        signature: message,
        windowStartMs: now,
        hitsInWindow: 1,
        lastWarnMs: now,
      };
      this.log.warn("MQTT forward: error", { message });
      return;
    }
    t.hitsInWindow += 1;
    if (now - t.lastWarnMs >= FORWARD_ERROR_WARN_INTERVAL_MS) {
      const elapsedSec = Math.max(1, Math.round((now - t.windowStartMs) / 1000));
      this.log.warn("MQTT forward: error (still failing)", {
        message,
        attemptsSinceLastSummary: t.hitsInWindow,
        elapsedSecondsApprox: elapsedSec,
      });
      t.lastWarnMs = now;
      t.windowStartMs = now;
      t.hitsInWindow = 0;
    }
  }

  disconnect() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
    if (this.client) {
      try {
        this.client.end(true);
      } catch {
        /* ignore */
      }
      this.client = undefined;
    }
  }

  /** Coalesce rapid stick updates; publish non-retained state snapshots. */
  schedulePublish(door: MaveoDoorPosition | undefined, light: boolean | undefined) {
    if (door !== undefined) this.pending.door = door;
    if (light !== undefined) this.pending.light = light;

    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.flush(), 80);
  }

  private flush() {
    this.debounceTimer = undefined;
    const c = this.client;
    if (!c?.connected) return;

    const { door, light } = this.pending;
    this.pending = {};

    const p = this.prefix;
    try {
      if (door !== undefined) {
        const label = maveoDoorPositionLabel(door);
        c.publish(`${p}/door_position`, String(door), { qos: 0, retain: false });
        c.publish(`${p}/door_label`, label, { qos: 0, retain: false });
      }
      if (light !== undefined) {
        c.publish(`${p}/light_on`, light ? "1" : "0", { qos: 0, retain: false });
      }
      /** No combined `<prefix>/state` JSON: LoxBerry MQTT Gateway “expand JSON” turns that
       *  into duplicate flat topics (e.g. `…_door##_label`) alongside the clean `door_label`
       *  topic — same values twice. Granular topics above are enough for Loxone/subscribers. */
    } catch (e) {
      this.log.warn("MQTT forward: publish failed", { error: String(e) });
    }
  }
}
