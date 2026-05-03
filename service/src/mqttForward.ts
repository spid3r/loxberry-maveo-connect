import mqtt, { type IClientOptions, type MqttClient } from "mqtt";
import type { PluginSettings } from "./settings.js";
import type { Logger } from "./logger.js";
import type { MaveoDoorPosition } from "maveo-connect-stick-client";
import { maveoDoorPositionLabel } from "maveo-connect-stick-client";

/** MQTT.js default reconnect is 1s → log spam + broker hammering when auth fails. */
const FORWARD_RECONNECT_MS = 30_000;
const FORWARD_ERROR_WARN_INTERVAL_MS = 60_000;

/**
 * Connection-state snapshot that drives the retained Loxone-friendly topics:
 * `<prefix>/mqtt_connected`, `<prefix>/session_takeover`, `<prefix>/transport`,
 * `<prefix>/backoff_until_ms`. Loxone HTTP-poll setups can also read all of
 * this via `…/api/status.php`, but the MQTT path is push-based and cheaper.
 */
export type ConnectionSnapshot = {
  mqttConnected: boolean;
  /** True iff the last MQTT loss looks like the Maveo app stole the session. Cleared on recovery. */
  sessionTakeover: boolean;
  /** Library-reported transport state ("connected" | "connecting" | "disconnected" | "reconnecting" …). */
  transport: string;
  /** > 0 while the auto-reclaim burst-pause is active; 0 otherwise. */
  backoffUntilMs: number;
};

/**
 * Compact, single-line diagnostic snapshot intended to be shown in a Loxone
 * Statusbaustein on the user's tablet — the Loxone app cannot embed a real
 * webview-style log viewer (the Webview block opens the system browser), so
 * we publish two retained topics that fit a Statusbaustein's text field:
 *
 *   <prefix>/last_error  → daemon's last surfaced error string, or "" when clean
 *   <prefix>/health      → e.g. `ok mqtt:connected door:closed light:off`
 *                          or  `warn mqtt:reclaiming takeover:1 backoff:118s`
 *
 * Retained = the Statusbaustein keeps showing the last value across broker
 * restarts. The fields the user can read off the health line at a glance are
 * `<level> mqtt:<transport> [takeover:1] [backoff:Ns] [door:<label>] [light:on|off]`.
 */
export type HealthSnapshot = {
  /** Free-form last error from the daemon, or null/"" when everything is fine. */
  lastError: string | null;
  /** One short line, ASCII, no newlines. Use `buildHealthLine` in service.ts to compose. */
  healthLine: string;
};

export class MqttForwarder {
  private client: MqttClient | undefined;
  private prefix = "maveo";
  private log: Logger;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private pending: { door?: MaveoDoorPosition; light?: boolean } = {};
  /**
   * Last connection-state snapshot we published, so we can suppress duplicate
   * publishes (a Loxone Statusbaustein is fine with retained-once values; we
   * don't need to spam the broker). Updated by `publishConnection` itself.
   */
  private lastConn: ConnectionSnapshot | undefined;
  /** Last health snapshot we published, so `publishHealth` can suppress no-ops. */
  private lastHealth: HealthSnapshot | undefined;
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
    this.lastConn = undefined;
    this.lastHealth = undefined;
  }

  /**
   * Publish the current connection snapshot to four retained topics under
   * `<prefix>/`. Retained = true so a Loxone Statusbaustein sees the last
   * known value immediately on broker reconnect (otherwise we'd only ever
   * fire on transitions and the block could sit empty for hours).
   *
   * Suppresses no-op publishes when nothing changed, and silently no-ops when
   * the forwarder is disabled / not connected to the LoxBerry broker —
   * upstream just calls this on every relevant event.
   */
  publishConnection(snapshot: ConnectionSnapshot): void {
    const c = this.client;
    if (!c?.connected) {
      this.lastConn = undefined;
      return;
    }
    const prev = this.lastConn;
    if (
      prev &&
      prev.mqttConnected === snapshot.mqttConnected &&
      prev.sessionTakeover === snapshot.sessionTakeover &&
      prev.transport === snapshot.transport &&
      prev.backoffUntilMs === snapshot.backoffUntilMs
    ) {
      return;
    }
    const p = this.prefix;
    try {
      c.publish(`${p}/mqtt_connected`, snapshot.mqttConnected ? "1" : "0", { qos: 0, retain: true });
      c.publish(`${p}/session_takeover`, snapshot.sessionTakeover ? "1" : "0", { qos: 0, retain: true });
      c.publish(`${p}/transport`, snapshot.transport, { qos: 0, retain: true });
      c.publish(`${p}/backoff_until_ms`, String(snapshot.backoffUntilMs), { qos: 0, retain: true });
      this.lastConn = { ...snapshot };
    } catch (e) {
      this.log.warn("MQTT forward: connection publish failed", { error: String(e) });
    }
  }

  /**
   * Publish the at-a-glance health line + last-error string for the Loxone
   * Statusbaustein. Both topics are retained so the tablet sees the latest
   * value the moment it reconnects to the broker, which is exactly what you
   * want for a "is the garage daemon happy?" widget.
   *
   * `last_error` carries an empty string while the daemon is clean — that
   * clears the Statusbaustein text without us needing a separate "no error"
   * sentinel value. The `healthLine` always has *something* to show.
   */
  publishHealth(snapshot: HealthSnapshot): void {
    const c = this.client;
    if (!c?.connected) {
      this.lastHealth = undefined;
      return;
    }
    const errStr = snapshot.lastError ?? "";
    const prev = this.lastHealth;
    if (prev && prev.healthLine === snapshot.healthLine && (prev.lastError ?? "") === errStr) {
      return;
    }
    const p = this.prefix;
    try {
      c.publish(`${p}/last_error`, errStr, { qos: 0, retain: true });
      c.publish(`${p}/health`, snapshot.healthLine, { qos: 0, retain: true });
      this.lastHealth = { lastError: errStr, healthLine: snapshot.healthLine };
    } catch (e) {
      this.log.warn("MQTT forward: health publish failed", { error: String(e) });
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
