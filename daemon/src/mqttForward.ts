import mqtt, { type MqttClient } from "mqtt";
import type { PluginSettings } from "./settings.js";
import type { Logger } from "./logger.js";
import type { MaveoDoorPosition } from "maveo-connect-stick-client";
import { maveoDoorPositionLabel } from "maveo-connect-stick-client";

export class MqttForwarder {
  private client: MqttClient | undefined;
  private prefix = "maveo";
  private log: Logger;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private pending: { door?: MaveoDoorPosition; light?: boolean } = {};

  constructor(log: Logger) {
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
    const opts: Parameters<typeof mqtt.connect>[1] = {};
    if (mf?.username) opts.username = mf.username;
    if (mf?.password) opts.password = mf.password;

    try {
      this.client = mqtt.connect(url, opts);
      this.client.on("connect", () => {
        this.log.info("MQTT forward: connected to local broker", { url });
      });
      this.client.on("error", (e) => {
        this.log.warn("MQTT forward: error", { message: String(e) });
      });
      this.client.on("close", () => {
        this.log.debug("MQTT forward: connection closed");
      });
    } catch (e) {
      this.log.error("MQTT forward: connect failed", { error: String(e) });
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
    } catch (e) {
      this.log.warn("MQTT forward: publish failed", { error: String(e) });
    }
  }
}
