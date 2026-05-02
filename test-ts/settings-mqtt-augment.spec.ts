import { expect } from "chai";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  augmentMqttForwardWithLoxberryGatewayCreds,
  inferLbHomeFromMaveoConfigEnv,
  loadSettingsFile,
} from "../service/src/settings.js";
import type { PluginSettings } from "../service/src/settings.js";

describe("augmentMqttForwardWithLoxberryGatewayCreds", () => {
  let tmp: string;
  let prevLb: string | undefined;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "mc-mqttgw-"));
    prevLb = process.env.LBHOMEDIR;
    process.env.LBHOMEDIR = tmp;
    mkdirSync(join(tmp, "config/plugins/mqttgateway"), { recursive: true });
  });

  afterEach(() => {
    process.env.LBHOMEDIR = prevLb;
    rmSync(tmp, { recursive: true, force: true });
  });

  it("fills empty broker user/pass from mqttgateway cred.json for local broker", () => {
    writeFileSync(
      join(tmp, "config/plugins/mqttgateway/cred.json"),
      JSON.stringify({ Credentials: { brokeruser: "gwuser", brokerpass: "gwsecret" } }),
    );
    const settingsPath = join(tmp, "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({
        maveo: {
          email: "a@b.c",
          password: "maveopw",
          cognitoIdentityPoolId: "eu-central-1:pool",
          thingName: "60031770671068012",
        },
        mqttForward: {
          enabled: true,
          brokerUrl: "mqtt://127.0.0.1:1883",
          username: "",
          password: "",
          topicPrefix: "maveo",
        },
      }),
    );

    const s = loadSettingsFile(settingsPath);
    expect(s.mqttForward?.username).to.equal("gwuser");
    expect(s.mqttForward?.password).to.equal("gwsecret");
  });

  it("prefers full MQTT Gateway pair over saved plugin fields on local broker", () => {
    writeFileSync(
      join(tmp, "config/plugins/mqttgateway/cred.json"),
      JSON.stringify({ Credentials: { brokeruser: "gwuser", brokerpass: "gwsecret" } }),
    );
    const disk: PluginSettings = {
      ...({
        maveo: {
          email: "a@b.c",
          password: "maveopw",
          cognitoIdentityPoolId: "eu-central-1:pool",
          thingName: "t",
        },
        mqttForward: {
          enabled: true,
          brokerUrl: "mqtt://127.0.0.1:1883",
          username: "stale",
          password: "stalepw",
          topicPrefix: "maveo",
        },
      } as PluginSettings),
    };
    const s = augmentMqttForwardWithLoxberryGatewayCreds(disk);
    expect(s.mqttForward?.username).to.equal("gwuser");
    expect(s.mqttForward?.password).to.equal("gwsecret");
  });

  it("accepts lowercase credentials block", () => {
    writeFileSync(
      join(tmp, "config/plugins/mqttgateway/cred.json"),
      JSON.stringify({ credentials: { brokeruser: "lowu", brokerpass: "lowp" } }),
    );
    const disk: PluginSettings = {
      ...({
        maveo: {
          email: "a@b.c",
          password: "maveopw",
          cognitoIdentityPoolId: "eu-central-1:pool",
          thingName: "t",
        },
        mqttForward: {
          enabled: true,
          brokerUrl: "mqtt://127.0.0.1:1883",
          username: "wrong",
          password: "wrong",
          topicPrefix: "maveo",
        },
      } as PluginSettings),
    };
    const s = augmentMqttForwardWithLoxberryGatewayCreds(disk);
    expect(s.mqttForward?.username).to.equal("lowu");
    expect(s.mqttForward?.password).to.equal("lowp");
  });

  it("ignores cred file for non-local broker URL", () => {
    writeFileSync(
      join(tmp, "config/plugins/mqttgateway/cred.json"),
      JSON.stringify({ Credentials: { brokeruser: "gwuser", brokerpass: "gwsecret" } }),
    );
    const disk: PluginSettings = {
      ...({
        maveo: {
          email: "a@b.c",
          password: "maveopw",
          cognitoIdentityPoolId: "eu-central-1:pool",
          thingName: "t",
        },
        mqttForward: {
          enabled: true,
          brokerUrl: "mqtt://192.168.1.50:1883",
          username: "",
          password: "",
          topicPrefix: "maveo",
        },
      } as PluginSettings),
    };
    const s = augmentMqttForwardWithLoxberryGatewayCreds(disk);
    expect(s.mqttForward?.username).to.equal("");
    expect(s.mqttForward?.password).to.equal("");
  });

  it("infers LBHOMEDIR from MAVOECONNECT_CONFIG when env LBHOMEDIR is unset", () => {
    const prevCfg = process.env.MAVOECONNECT_CONFIG;
    const settingsPath = join(tmp, "config/plugins/maveoconnect/settings.json");
    process.env.MAVOECONNECT_CONFIG = settingsPath;
    delete process.env.LBHOMEDIR;

    expect(inferLbHomeFromMaveoConfigEnv()).to.equal(tmp);

    writeFileSync(
      join(tmp, "config/plugins/mqttgateway/cred.json"),
      JSON.stringify({ Credentials: { brokeruser: "envu", brokerpass: "envp" } }),
    );
    mkdirSync(join(tmp, "config/plugins/maveoconnect"), { recursive: true });
    writeFileSync(
      settingsPath,
      JSON.stringify({
        maveo: {
          email: "a@b.c",
          password: "maveopw",
          cognitoIdentityPoolId: "eu-central-1:pool",
          thingName: "t",
        },
        mqttForward: {
          enabled: true,
          brokerUrl: "mqtt://127.0.0.1:1883",
          username: "",
          password: "",
          topicPrefix: "maveo",
        },
      }),
    );

    const s = loadSettingsFile(settingsPath);
    expect(s.mqttForward?.username).to.equal("envu");
    expect(s.mqttForward?.password).to.equal("envp");

    if (prevCfg === undefined) {
      delete process.env.MAVOECONNECT_CONFIG;
    } else {
      process.env.MAVOECONNECT_CONFIG = prevCfg;
    }
    process.env.LBHOMEDIR = tmp;
  });

  it("uses config/system/general.json Mqtt before plugin cred files", () => {
    const cfgDir = join(tmp, "config", "system");
    mkdirSync(cfgDir, { recursive: true });
    writeFileSync(
      join(cfgDir, "general.json"),
      JSON.stringify({
        Mqtt: {
          Brokerhost: "127.0.0.1",
          Brokerport: "1883",
          Brokeruser: "fromgeneral",
          Brokerpass: "gpass",
        },
      }),
    );
    const gwDir = join(tmp, "config", "plugins", "mqttgateway");
    mkdirSync(gwDir, { recursive: true });
    writeFileSync(
      join(gwDir, "cred.json"),
      JSON.stringify({ Credentials: { brokeruser: "gwonly", brokerpass: "ignored" } }),
    );
    const settingsPath = join(tmp, "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({
        maveo: {
          email: "a@b.c",
          password: "maveopw",
          cognitoIdentityPoolId: "eu-central-1:pool",
          thingName: "t",
        },
        mqttForward: {
          enabled: true,
          brokerUrl: "mqtt://127.0.0.1:1883",
          username: "",
          password: "",
          topicPrefix: "maveo",
        },
      }),
    );

    const s = loadSettingsFile(settingsPath);
    expect(s.mqttForward?.username).to.equal("fromgeneral");
    expect(s.mqttForward?.password).to.equal("gpass");
  });
});
