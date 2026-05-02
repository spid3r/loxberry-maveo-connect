# 1.0.0 (2026-05-02)


### Features

* **build:** first commit ([4015877](https://github.com/spid3r/loxberry-maveo-connect/commit/40158779460468e19209bdd70d0f53a920f5c929))
* enhance MQTT forwarding and LoxBerry integration ([50d87a7](https://github.com/spid3r/loxberry-maveo-connect/commit/50d87a7f77487d7690475b6f05582a45d88686f2))
* release version 1.1.0 with MQTT enhancements and UI improvements ([f25d30f](https://github.com/spid3r/loxberry-maveo-connect/commit/f25d30fa9e2e13d4127299a4f851a58702cd368b))
* update wiki screenshot scripts and enhance status page functionality ([c1e522d](https://github.com/spid3r/loxberry-maveo-connect/commit/c1e522da2638079914f671d7bd9f2af3b0796454))

# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0]

- MQTT forward: resolve broker credentials like **loxberry-api-abfall-io** (`general.json` Mqtt, then `cred.json` paths under `$LBHOMEDIR`); prefer gateway pair on local broker; infer `$LBHOMEDIR` from `MAVOECONNECT_CONFIG` when needed; export `LBHOMEDIR` in init script for Node.
- MQTT forward: throttle repeated broker errors; slower reconnect; publish only topic-prefix branches `door_position`, `door_label`, `light_on` (no aggregate JSON topic `state` — avoids duplicate `##` names when LoxBerry MQTT Gateway expands JSON).
- Settings UI: Loxone / MQTT integration help (same broker as LoxBerry IP, latency, no commands in); LoxBerry-broker hint text; log page fully i18n.
- Daemon: optional `debug` logging for stick/MQTT forward behaviour (existing log level control).

## [1.0.3]

- CI, semantic‑release ZIP assets, wiki generation, Dependabot (parity with sibling LoxBerry plugins).
- Testable daemon HTTP surface (injectable Maveo client port) plus Mocha unit tests.
