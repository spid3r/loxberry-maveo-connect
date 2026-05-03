import http from "node:http";
import type { AddressInfo } from "node:net";
import { expect } from "chai";
import { createDaemonRequestHandler, buildStatus } from "../service/src/daemonHttp.js";
import type { DaemonMutableState } from "../service/src/daemonHttp.js";
import type { StickClientPort } from "../service/src/stickClientPort.js";
import type { PluginSettings } from "../service/src/settings.js";
import { createLogger } from "../service/src/logger.js";
import type {
  AutomaticMqttReclaimOptions,
  GarageDoorCommand,
  MaveoSession,
  MqttSessionLostEvent,
} from "maveo-connect-stick-client";

function minimalSettings(): PluginSettings {
  return {
    maveo: {
      email: "a@b.c",
      password: "pw",
      cognitoIdentityPoolId: "pool",
      thingName: "stick1",
      cognitoClientId: "",
      region: "us-west-2",
      useTestEndpoints: false,
      iotHostname: "",
      mqttWssSigning: "",
    },
    advanced: {},
    daemon: {},
    logging: {},
    mqttForward: { enabled: false },
  };
}

/** Deterministic stub for HTTP tests (no network / AWS). */
function createFakeStick(state: Partial<StickClientPort> = {}): StickClientPort & { calls: string[] } {
  const calls: string[] = [];
  let transport: "connected" | "disconnected" | "reclaiming" = "disconnected";

  const base = {
    async login(): Promise<MaveoSession> {
      calls.push("login");
      return {} as unknown as MaveoSession;
    },
    async connectMqtt(): Promise<void> {
      transport = "connected";
      calls.push("connectMqtt");
    },
    async subscribeBlueFiResponses(): Promise<void> {
      calls.push("subscribeBlueFiResponses");
    },
    async disconnectMqtt(): Promise<void> {
      transport = "disconnected";
      calls.push("disconnectMqtt");
    },
    async recoverMqttSession(): Promise<void> {
      calls.push("recoverMqttSession");
    },
    async requestDoorStatus(): Promise<void> {
      calls.push("requestDoorStatus");
    },
    async requestLightState(): Promise<void> {
      calls.push("requestLightState");
    },
    async publishLight(on: boolean): Promise<void> {
      calls.push(`publishLight:${on}`);
    },
    async publishGarageDoor(cmd: GarageDoorCommand): Promise<void> {
      calls.push(`publishGarageDoor:${cmd}`);
    },
    onStickState(): () => void {
      calls.push("onStickState");
      return (): void => {};
    },
    enableAutomaticMqttReclaim(opts: AutomaticMqttReclaimOptions): () => void {
      void opts;
      calls.push("enableAutomaticMqttReclaim");
      return (): void => {};
    },
    onMqttSessionLost(cb: (ev: MqttSessionLostEvent) => void): void {
      void cb;
      calls.push("onMqttSessionLost");
    },
    onMaveoLifecycle(): void {},
    getMqttTransportState() {
      return transport;
    },
    isMqttConnected() {
      return transport === "connected";
    },
    getAutoReclaimBackoffUntilMs() {
      return 0;
    },
    stickSerial(): string {
      return "stickserial";
    },
  };

  const merged = {
    calls,
    ...base,
    ...state,
    getMqttTransportState:
      typeof state.getMqttTransportState === "function" ? state.getMqttTransportState : base.getMqttTransportState,
    isMqttConnected:
      typeof state.isMqttConnected === "function" ? state.isMqttConnected : base.isMqttConnected,
    getAutoReclaimBackoffUntilMs:
      typeof state.getAutoReclaimBackoffUntilMs === "function"
        ? state.getAutoReclaimBackoffUntilMs
        : base.getAutoReclaimBackoffUntilMs,
    stickSerial: typeof state.stickSerial === "function" ? state.stickSerial : base.stickSerial,
  };

  return merged as StickClientPort & { calls: string[] };
}

async function withServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
  fn: (base: URL) => Promise<void>,
): Promise<void> {
  const srv = http.createServer((req, res) => void handler(req, res));
  await new Promise<void>((resolve, reject) => {
    srv.listen(0, "127.0.0.1", () => resolve());
    srv.once("error", reject);
  });
  const addr = srv.address() as AddressInfo;
  const base = new URL(`http://127.0.0.1:${addr.port}/`);
  try {
    await fn(base);
  } finally {
    await new Promise<void>((resolve, reject) => srv.close((err) => (err ? reject(err) : resolve())));
  }
}

describe("daemonHttp", () => {
  it("GET /api/status returns 401 without token", async () => {
    const stub = createFakeStick();
    const settings = minimalSettings();
    const log = createLogger("error", "/tmp/test-maveo-daemon.log");
    const mutable: DaemonMutableState = {
      connectedAtMs: null,
      lastStick: undefined,
      lastStickAt: null,
      lastDoor: undefined,
      lastLight: undefined,
      lastError: null,
      lastSessionLoss: null,
    };
    const h = createDaemonRequestHandler({
      getApiToken: () => "secret",
      getClient: () => stub,
      getSettings: () => settings,
      getRuntimeEnv: () => process.env as NodeJS.ProcessEnv,
      getMaveoEnv: () => ({ ...process.env, MAVEO_THING_NAME: "stick1" }),
      mutable,
      bindStickState: () => {},
      log,
    });

    await withServer(h, async (base) => {
      const r = await fetch(new URL("api/status", base), {});
      expect(r.status).to.equal(401);
    });
  });

  it("GET /api/status returns JSON when authorized", async () => {
    const stub = createFakeStick({
      getMqttTransportState() {
        return "connected";
      },
      isMqttConnected() {
        return true;
      },
      getAutoReclaimBackoffUntilMs() {
        return 123;
      },
    });
    const settings = minimalSettings();
    const log = createLogger("error", "/tmp/test-maveo-daemon.log");
    const mutable: DaemonMutableState = {
      connectedAtMs: null,
      lastStick: undefined,
      lastStickAt: null,
      lastDoor: undefined,
      lastLight: undefined,
      lastError: null,
      lastSessionLoss: null,
    };
    const h = createDaemonRequestHandler({
      getApiToken: () => "secret",
      getClient: () => stub,
      getSettings: () => settings,
      getRuntimeEnv: () => process.env as NodeJS.ProcessEnv,
      getMaveoEnv: () => ({ ...process.env }),
      mutable,
      bindStickState: () => {},
      log,
    });

    await withServer(h, async (base) => {
      const r = await fetch(new URL("api/status", base), {
        headers: { "x-maveo-token": "secret" },
      });
      expect(r.status).to.equal(200);
      const j = (await r.json()) as Record<string, unknown>;
      expect(j.transport).to.equal("connected");
      expect(j.settingsOk).to.be.true;
      expect(typeof j._streamRev).to.equal("number");
    });
  });

  it("GET /api/log/recent returns recent ring buffer lines", async () => {
    const stub = createFakeStick({
      getMqttTransportState() {
        return "connected";
      },
      isMqttConnected() {
        return true;
      },
    });
    const settings = minimalSettings();
    const log = createLogger("info", "/tmp/test-maveo-daemon-ring.log");
    log.info("daemon_test_ring_line");
    const mutable: DaemonMutableState = {
      connectedAtMs: null,
      lastStick: undefined,
      lastStickAt: null,
      lastDoor: undefined,
      lastLight: undefined,
      lastError: null,
      lastSessionLoss: null,
    };
    const h = createDaemonRequestHandler({
      getApiToken: () => "secret",
      getClient: () => stub,
      getSettings: () => settings,
      getRuntimeEnv: () => process.env as NodeJS.ProcessEnv,
      getMaveoEnv: () => ({ ...process.env }),
      mutable,
      bindStickState: () => {},
      log,
    });

    await withServer(h, async (base) => {
      const r = await fetch(new URL("api/log/recent?limit=50", base), {
        headers: { "x-maveo-token": "secret" },
      });
      expect(r.status).to.equal(200);
      const j = (await r.json()) as { ok?: boolean; lines?: string[] };
      expect(j.ok).to.equal(true);
      expect((j.lines ?? []).some((l) => l.includes("daemon_test_ring_line"))).to.equal(true);
    });
  });

  it("GET /api/status/wait returns immediately when rev is behind server stream", async () => {
    const stub = createFakeStick({
      getMqttTransportState() {
        return "connected";
      },
      isMqttConnected() {
        return true;
      },
    });
    const settings = minimalSettings();
    const log = createLogger("error", "/tmp/test-maveo-daemon.log");
    const mutable: DaemonMutableState = {
      connectedAtMs: null,
      lastStick: undefined,
      lastStickAt: null,
      lastDoor: undefined,
      lastLight: undefined,
      lastError: null,
      lastSessionLoss: null,
    };
    const h = createDaemonRequestHandler({
      getApiToken: () => "secret",
      getClient: () => stub,
      getSettings: () => settings,
      getRuntimeEnv: () => process.env as NodeJS.ProcessEnv,
      getMaveoEnv: () => ({ ...process.env }),
      mutable,
      bindStickState: () => {},
      log,
    });

    await withServer(h, async (base) => {
      const r = await fetch(new URL("api/status/wait?rev=-1", base), {
        headers: { "x-maveo-token": "secret" },
      });
      expect(r.status).to.equal(200);
      const j = (await r.json()) as Record<string, unknown>;
      expect(typeof j._streamRev).to.equal("number");
      expect(j.transport).to.equal("connected");
    });
  });

  it("POST /api/log/level switches runtime level and rejects bogus values", async () => {
    const stub = createFakeStick();
    const settings = minimalSettings();
    const log = createLogger("info", "/tmp/test-maveo-daemon-level.log");
    const mutable: DaemonMutableState = {
      connectedAtMs: null,
      lastStick: undefined,
      lastStickAt: null,
      lastDoor: undefined,
      lastLight: undefined,
      lastError: null,
      lastSessionLoss: null,
    };
    const h = createDaemonRequestHandler({
      getApiToken: () => "secret",
      getClient: () => stub,
      getSettings: () => settings,
      getRuntimeEnv: () => process.env as NodeJS.ProcessEnv,
      getMaveoEnv: () => ({ ...process.env }),
      mutable,
      bindStickState: () => {},
      log,
    });

    await withServer(h, async (base) => {
      const ok = await fetch(new URL("api/log/level", base), {
        method: "POST",
        headers: { "x-maveo-token": "secret", "Content-Type": "application/json" },
        body: JSON.stringify({ level: "debug" }),
      });
      expect(ok.status).to.equal(200);
      const okJ = (await ok.json()) as { ok: boolean; level: string; previous: string };
      expect(okJ.ok).to.equal(true);
      expect(okJ.level).to.equal("debug");
      expect(okJ.previous).to.equal("info");
      expect(log.level).to.equal("debug");

      const bad = await fetch(new URL("api/log/level", base), {
        method: "POST",
        headers: { "x-maveo-token": "secret", "Content-Type": "application/json" },
        body: JSON.stringify({ level: "spam" }),
      });
      expect(bad.status).to.equal(400);
      expect(log.level).to.equal("debug");
    });
  });

  it("POST /api/door returns 400 for invalid command", async () => {
    const stub = createFakeStick();
    const settings = minimalSettings();
    const log = createLogger("error", "/tmp/test-maveo-daemon.log");
    const mutable: DaemonMutableState = {
      connectedAtMs: null,
      lastStick: undefined,
      lastStickAt: null,
      lastDoor: undefined,
      lastLight: undefined,
      lastError: null,
      lastSessionLoss: null,
    };
    const h = createDaemonRequestHandler({
      getApiToken: () => "secret",
      getClient: () => stub,
      getSettings: () => settings,
      getRuntimeEnv: () => process.env as NodeJS.ProcessEnv,
      getMaveoEnv: () => ({ ...process.env }),
      mutable,
      bindStickState: () => {},
      log,
    });

    await withServer(h, async (base) => {
      const r = await fetch(new URL("api/door", base), {
        method: "POST",
        headers: { "x-maveo-token": "secret", "Content-Type": "application/json" },
        body: JSON.stringify({ command: "bogus" }),
      });
      expect(r.status).to.equal(400);
    });
  });
});

describe("buildStatus", () => {
  it("computes stickSerial fallback from settings on stickSerial throw", () => {
    const stub = createFakeStick({
      stickSerial: () => {
        throw new Error("no serial");
      },
    });
    const settings = minimalSettings();
    const typed: DaemonMutableState = {
      connectedAtMs: null,
      lastStick: undefined,
      lastStickAt: null,
      lastDoor: undefined,
      lastLight: undefined,
      lastError: null,
      lastSessionLoss: null,
    };

    const b = buildStatus(stub, settings, process.env, typed);
    expect(b.stickSerial).to.equal("stick1");
  });
});
