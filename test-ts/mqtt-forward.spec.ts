import { expect } from "chai";
import { MqttForwarder, type ConnectionSnapshot, type HealthSnapshot } from "../service/src/mqttForward.js";
import { createLogger } from "../service/src/logger.js";

type Captured = { topic: string; payload: string; opts?: { qos?: number; retain?: boolean } };

/**
 * Minimal stand-in for an `mqtt.MqttClient`. We only exercise the .publish()
 * surface that `publishConnection` uses; the real MQTT.js connection events
 * are out of scope for this unit test.
 */
function attachFakeBroker(forwarder: MqttForwarder): { sent: Captured[] } {
  const sent: Captured[] = [];
  const fake = {
    connected: true,
    publish(topic: string, payload: string, opts?: { qos?: number; retain?: boolean }) {
      sent.push({ topic, payload, opts });
    },
  };
  // @ts-expect-error: we deliberately swap in a stub for the private MQTT client.
  forwarder.client = fake;
  return { sent };
}

describe("MqttForwarder.publishConnection", () => {
  it("publishes mqtt_connected/session_takeover/transport/backoff_until_ms retained", () => {
    const log = createLogger("error", "/tmp/test-maveo-mqtt-forward.log");
    const f = new MqttForwarder(log);
    const { sent } = attachFakeBroker(f);

    const snap: ConnectionSnapshot = {
      mqttConnected: true,
      sessionTakeover: false,
      transport: "connected",
      backoffUntilMs: 0,
    };
    f.publishConnection(snap);

    const topics = sent.map((s) => s.topic);
    expect(topics).to.include.members([
      "maveo/mqtt_connected",
      "maveo/session_takeover",
      "maveo/transport",
      "maveo/backoff_until_ms",
    ]);
    for (const c of sent) {
      expect(c.opts?.retain, `retain on ${c.topic}`).to.equal(true);
    }
    const conn = sent.find((s) => s.topic === "maveo/mqtt_connected")!;
    expect(conn.payload).to.equal("1");
  });

  it("suppresses no-op publishes when nothing changed", () => {
    const log = createLogger("error", "/tmp/test-maveo-mqtt-forward.log");
    const f = new MqttForwarder(log);
    const { sent } = attachFakeBroker(f);

    const snap: ConnectionSnapshot = {
      mqttConnected: true,
      sessionTakeover: false,
      transport: "connected",
      backoffUntilMs: 0,
    };
    f.publishConnection(snap);
    const after1 = sent.length;
    f.publishConnection({ ...snap });
    expect(sent.length, "second identical snapshot is a no-op").to.equal(after1);
  });

  it("re-publishes when sessionTakeover flips on", () => {
    const log = createLogger("error", "/tmp/test-maveo-mqtt-forward.log");
    const f = new MqttForwarder(log);
    const { sent } = attachFakeBroker(f);

    f.publishConnection({
      mqttConnected: true,
      sessionTakeover: false,
      transport: "connected",
      backoffUntilMs: 0,
    });
    sent.length = 0;
    f.publishConnection({
      mqttConnected: false,
      sessionTakeover: true,
      transport: "disconnected",
      backoffUntilMs: 0,
    });

    const takeover = sent.find((s) => s.topic === "maveo/session_takeover")!;
    expect(takeover.payload).to.equal("1");
    const conn = sent.find((s) => s.topic === "maveo/mqtt_connected")!;
    expect(conn.payload).to.equal("0");
  });

  it("does nothing when not connected to a broker", () => {
    const log = createLogger("error", "/tmp/test-maveo-mqtt-forward.log");
    const f = new MqttForwarder(log);
    f.publishConnection({
      mqttConnected: true,
      sessionTakeover: false,
      transport: "connected",
      backoffUntilMs: 0,
    });
    /** No throw, no side-effect — just early-return. */
  });
});

describe("MqttForwarder.publishHealth", () => {
  it("publishes <prefix>/last_error and <prefix>/health retained", () => {
    const log = createLogger("error", "/tmp/test-maveo-mqtt-forward.log");
    const f = new MqttForwarder(log);
    const { sent } = attachFakeBroker(f);

    const snap: HealthSnapshot = {
      lastError: "Maveo connect failed: invalid_credentials",
      healthLine: "error mqtt:disconnected",
    };
    f.publishHealth(snap);

    const topics = sent.map((s) => s.topic);
    expect(topics).to.include.members(["maveo/last_error", "maveo/health"]);
    for (const c of sent) {
      expect(c.opts?.retain, `retain on ${c.topic}`).to.equal(true);
    }
    const err = sent.find((s) => s.topic === "maveo/last_error")!;
    expect(err.payload).to.equal("Maveo connect failed: invalid_credentials");
    const h = sent.find((s) => s.topic === "maveo/health")!;
    expect(h.payload).to.equal("error mqtt:disconnected");
  });

  it("clears <prefix>/last_error with an empty string when no error", () => {
    const log = createLogger("error", "/tmp/test-maveo-mqtt-forward.log");
    const f = new MqttForwarder(log);
    const { sent } = attachFakeBroker(f);

    f.publishHealth({ lastError: null, healthLine: "ok mqtt:connected door:closed light:off" });

    const err = sent.find((s) => s.topic === "maveo/last_error")!;
    expect(err.payload).to.equal("");
    expect(err.opts?.retain).to.equal(true);
  });

  it("suppresses duplicate snapshots", () => {
    const log = createLogger("error", "/tmp/test-maveo-mqtt-forward.log");
    const f = new MqttForwarder(log);
    const { sent } = attachFakeBroker(f);
    const snap: HealthSnapshot = { lastError: null, healthLine: "ok mqtt:connected" };
    f.publishHealth(snap);
    const after1 = sent.length;
    f.publishHealth({ ...snap });
    expect(sent.length).to.equal(after1);
  });
});
