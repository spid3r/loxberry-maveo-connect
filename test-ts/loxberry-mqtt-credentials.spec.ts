import { expect } from "chai";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadLoxBerryBrokerCredentials } from "../service/src/loxberryMqttCredentials.js";

describe("loadLoxBerryBrokerCredentials (abfall-io parity)", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "mc-lb-mqtt-"));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("reads LoxBerry 3 general.json Mqtt block", () => {
    const cfgDir = join(tmp, "config", "system");
    mkdirSync(cfgDir, { recursive: true });
    writeFileSync(
      join(cfgDir, "general.json"),
      JSON.stringify({
        Mqtt: {
          Brokerhost: "127.0.0.1",
          Brokerport: "1883",
          Brokeruser: "loxberry",
          Brokerpass: "from-general-json",
        },
      }),
    );
    const d = loadLoxBerryBrokerCredentials(tmp);
    expect(d).to.not.equal(null);
    expect(d!.host).to.equal("127.0.0.1");
    expect(d!.port).to.equal(1883);
    expect(d!.user).to.equal("loxberry");
    expect(d!.password).to.equal("from-general-json");
    expect(d!.source).to.match(/general\.json$/);
  });

  it("reads system/storage/mqtt/cred.json flat layout", () => {
    const credDir = join(tmp, "system", "storage", "mqtt");
    mkdirSync(credDir, { recursive: true });
    writeFileSync(
      join(credDir, "cred.json"),
      JSON.stringify({
        brokerhost: "127.0.0.1",
        brokerport: 1883,
        brokeruser: "u1",
        brokerpass: "p1",
      }),
    );
    const d = loadLoxBerryBrokerCredentials(tmp);
    expect(d!.user).to.equal("u1");
    expect(d!.password).to.equal("p1");
  });

  it("reads mqttgateway cred.json Credentials-only", () => {
    const dir = join(tmp, "config", "plugins", "mqttgateway");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "cred.json"),
      JSON.stringify({ Credentials: { brokeruser: "gw", brokerpass: "secret" } }),
    );
    const d = loadLoxBerryBrokerCredentials(tmp);
    expect(d!.host).to.equal("127.0.0.1");
    expect(d!.port).to.equal(1883);
    expect(d!.user).to.equal("gw");
    expect(d!.password).to.equal("secret");
  });
});
