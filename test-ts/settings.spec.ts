import { expect } from "chai";
import { applyMaveoEnvToProcess, loadSettingsFile, settingsToMaveoEnv } from "../service/src/settings.js";
import { MAVEO_DEFAULT_STACK } from "../service/src/maveoStackDefaults.js";

describe("Maveo default stack (base64-decoded)", () => {
  it("decodes into shapes the Maveo cloud expects", () => {
    expect(MAVEO_DEFAULT_STACK.region).to.match(/^[a-z]{2,}-[a-z]+-\d+$/);
    expect(MAVEO_DEFAULT_STACK.cognitoClientId).to.match(/^[a-z0-9]{20,40}$/);
    expect(MAVEO_DEFAULT_STACK.cognitoIdentityPoolId).to.match(
      /^[a-z]{2,}-[a-z]+-\d+:[0-9a-f-]{36}$/,
    );
    expect(MAVEO_DEFAULT_STACK.userPoolId).to.match(/^[a-z]{2,}-[a-z]+-\d+_[A-Za-z0-9]{8,}$/);
    expect(MAVEO_DEFAULT_STACK.iotHostname).to.match(/^[a-z]{2,}-[a-z]+-\d+\.iot-prod\.[a-z-]+\.[a-z]{2,}$/);
    expect(MAVEO_DEFAULT_STACK.iotHostname.startsWith(MAVEO_DEFAULT_STACK.region + ".")).to.equal(true);
  });
});

describe("plugin settings", () => {
  it("defaults empty email and EU-central-1 prod cloud stack without file", () => {
    const settings = loadSettingsFile("/nonexistent/path/settings_" + Math.random().toString(36) + ".json");
    expect(settings.maveo.email).to.equal("");
    expect(settings.daemon?.port).to.be.a("number");
    expect(settings.maveo.cognitoIdentityPoolId).to.equal(MAVEO_DEFAULT_STACK.cognitoIdentityPoolId);
    expect(settings.maveo.cognitoClientId).to.equal(MAVEO_DEFAULT_STACK.cognitoClientId);
    expect(settings.maveo.region).to.equal(MAVEO_DEFAULT_STACK.region);
    expect(settings.maveo.iotHostname).to.equal(MAVEO_DEFAULT_STACK.iotHostname);
  });

  it("maps Maveo fields into env for the stick client", () => {
    const settings = loadSettingsFile("/nonexistent/no.json");
    const env = settingsToMaveoEnv(
      {
        ...settings,
        maveo: {
          ...settings.maveo,
          email: "u@example.com",
          password: "p",
          cognitoIdentityPoolId: "aws-pool",
          thingName: "TH123",
        },
      },
      { ...(process.env as NodeJS.ProcessEnv), UNRELATED_SETTING: "x" },
    );
    expect(env.MAVEO_EMAIL).to.equal("u@example.com");
    expect(env.MAVEO_THING_NAME).to.equal("TH123");
    expect(env.MAVEO_MQTT_CLIENT_ID).to.equal("TH123");
    expect(env.MAVEO_COGNITO_IDENTITY_POOL_ID).to.equal("aws-pool");
    expect(env.MAVEO_IOT_HOSTNAME).to.equal(MAVEO_DEFAULT_STACK.iotHostname);
    expect(env.MAVEO_REGION).to.equal(MAVEO_DEFAULT_STACK.region);
  });

  it("applyMaveoEnvToProcess mirrors MAVEO_THING_NAME / MAVEO_MQTT_CLIENT_ID into process.env", () => {
    const before = {
      thing: process.env.MAVEO_THING_NAME,
      client: process.env.MAVEO_MQTT_CLIENT_ID,
      hostname: process.env.MAVEO_IOT_HOSTNAME,
    };
    try {
      delete process.env.MAVEO_THING_NAME;
      delete process.env.MAVEO_MQTT_CLIENT_ID;
      delete process.env.MAVEO_IOT_HOSTNAME;
      applyMaveoEnvToProcess({
        MAVEO_THING_NAME: "60031770671068012",
        MAVEO_MQTT_CLIENT_ID: "60031770671068012",
        MAVEO_IOT_HOSTNAME: "x.iot-prod.example.de",
      } as NodeJS.ProcessEnv);
      expect(process.env.MAVEO_THING_NAME).to.equal("60031770671068012");
      expect(process.env.MAVEO_MQTT_CLIENT_ID).to.equal("60031770671068012");
      expect(process.env.MAVEO_IOT_HOSTNAME).to.equal("x.iot-prod.example.de");
      applyMaveoEnvToProcess({} as NodeJS.ProcessEnv);
      expect(process.env.MAVEO_THING_NAME).to.equal(undefined);
      expect(process.env.MAVEO_MQTT_CLIENT_ID).to.equal(undefined);
      expect(process.env.MAVEO_IOT_HOSTNAME).to.equal(undefined);
    } finally {
      if (before.thing !== undefined) process.env.MAVEO_THING_NAME = before.thing;
      else delete process.env.MAVEO_THING_NAME;
      if (before.client !== undefined) process.env.MAVEO_MQTT_CLIENT_ID = before.client;
      else delete process.env.MAVEO_MQTT_CLIENT_ID;
      if (before.hostname !== undefined) process.env.MAVEO_IOT_HOSTNAME = before.hostname;
      else delete process.env.MAVEO_IOT_HOSTNAME;
    }
  });
});
