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
