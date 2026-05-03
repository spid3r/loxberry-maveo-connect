# [1.2.0](https://github.com/spid3r/loxberry-maveo-connect/compare/v1.1.1...v1.2.0) (2026-05-03)


### Features

* **wiki:** add curated Loxone wiring gallery section ([d9ba882](https://github.com/spid3r/loxberry-maveo-connect/commit/d9ba8822d0fa388a3c99bcb8d9d78e6023e36357))

## [1.1.1](https://github.com/spid3r/loxberry-maveo-connect/compare/v1.1.0...v1.1.1) (2026-05-03)


### Bug Fixes

* **wiki:** include semantic-release level-1 headings and skip pre-releases ([51f7fb6](https://github.com/spid3r/loxberry-maveo-connect/commit/51f7fb6512e9d5e339905a4ea7795a9e7883cc5a))

# [1.1.0](https://github.com/spid3r/loxberry-maveo-connect/compare/v1.0.1...v1.1.0) (2026-05-03)


### Bug Fixes

* **build:** strip VS Code auto-attach env from spawned subprocesses ([e9f1530](https://github.com/spid3r/loxberry-maveo-connect/commit/e9f15304f3a60f4d9dbf4b17ef3b73ca4da2e47c))
* **loxone:** re-publish mqtt_connected/health after manual /api/reconnect ([068de68](https://github.com/spid3r/loxberry-maveo-connect/commit/068de68dbc193272597cc24faa6f7dabaaea2003))


### Features

* **api:** add Loxone control HTTP API behind LoxBerry Basic Auth ([778b06c](https://github.com/spid3r/loxberry-maveo-connect/commit/778b06c8ac2d44a6f88c4509e168396f9e5ac81c))
* **log:** add size-based log rotation and clear-log control ([75a8b6b](https://github.com/spid3r/loxberry-maveo-connect/commit/75a8b6b104edc1eadfe882ad2a9af941e43764a7))
* **loxone:** expose detached / takeover state via MQTT and status.php ([69c350a](https://github.com/spid3r/loxberry-maveo-connect/commit/69c350a4ce58dbf4401069120393349ead8b8447))
* **loxone:** on-the-fly log diagnostics from the Loxone app ([9008893](https://github.com/spid3r/loxberry-maveo-connect/commit/900889348bdb99e83765d61d624fdf7f37c767e7))
* **loxone:** publish retained last_error and health diagnose topics ([f423ab8](https://github.com/spid3r/loxberry-maveo-connect/commit/f423ab86d4c6f91bb7303ae8c87f8a8b339c48fb)), closes [hi#frequency](https://github.com/hi/issues/frequency)

## [1.0.1-beta.6](https://github.com/spid3r/loxberry-maveo-connect/compare/v1.0.1-beta.5...v1.0.1-beta.6) (2026-05-03)

* fix(loxone): re-publish mqtt_connected/health after manual /api/reconnect

## [1.0.1-beta.5](https://github.com/spid3r/loxberry-maveo-connect/compare/v1.0.1-beta.4...v1.0.1-beta.5) (2026-05-03)

* feat(loxone): publish retained last_error and health diagnose topics

## [1.0.1-beta.4](https://github.com/spid3r/loxberry-maveo-connect/compare/v1.0.1-beta.3...v1.0.1-beta.4) (2026-05-03)

* Beta integration build (see commits on branch `beta`).

## [1.0.1-beta.3](https://github.com/spid3r/loxberry-maveo-connect/compare/v1.0.1-beta.2...v1.0.1-beta.3) (2026-05-03)

* feat(loxone): on-the-fly log diagnostics from the Loxone app
* feat(loxone): expose detached / takeover state via MQTT and status.php

## [1.0.1-beta.2](https://github.com/spid3r/loxberry-maveo-connect/compare/v1.0.1-beta.1...v1.0.1-beta.2) (2026-05-03)

* feat(log): add size-based log rotation and clear-log control

## [1.0.1-beta.1](https://github.com/spid3r/loxberry-maveo-connect/compare/v1.0.1...v1.0.1-beta.1) (2026-05-03)

* fix(build): strip VS Code auto-attach env from spawned subprocesses
* feat(api): add Loxone control HTTP API behind LoxBerry Basic Auth

## [1.0.1](https://github.com/spid3r/loxberry-maveo-connect/compare/v1.0.0...v1.0.1) (2026-05-02)


### Bug Fixes

* **docs:** add disclaimer ([12db4a2](https://github.com/spid3r/loxberry-maveo-connect/commit/12db4a2e4dfef3b48668e45603a9b025b1621b19))

# Changelog

All notable changes to this project will be documented in this file.

The layout follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
 
## [1.0.0] — 2026-05-02

First public **LoxBerry 3** release of **Maveo Connect**: garage door and light via **Marantec Maveo Connect Stick** and Marantec cloud (**AWS Cognito** + **IoT MQTT**), with embedded PHP admin UI (**German / English**), optional forwarding to a **local MQTT broker** (e.g. LoxBerry MQTT / Loxone), and a **token-protected** mini HTTP API for the UI and automation.

Also in this line:

- **CI & packaging:** GitHub Actions, semantic-release–style ZIP artifacts, generated wiki starter doc, Dependabot (aligned with sibling LoxBerry plugins).
- **Quality:** Mocha unit tests and an injectable port for the Maveo client so the daemon HTTP surface stays testable without cloud hardware.

- MQTT forward: resolve broker credentials like **loxberry-api-abfall-io** (`general.json` Mqtt, then `cred.json` paths under `$LBHOMEDIR`); prefer gateway pair on local broker; infer `$LBHOMEDIR` from `MAVOECONNECT_CONFIG` when needed; export `LBHOMEDIR` in init script for Node.
- MQTT forward: throttle repeated broker errors; slower reconnect; publish only topic-prefix branches `door_position`, `door_label`, `light_on` (no aggregate JSON topic `state` — avoids duplicate `##` names when LoxBerry MQTT Gateway expands JSON).
- Settings UI: Loxone / MQTT integration help (same broker as LoxBerry IP, latency, no commands in); LoxBerry-broker hint text; log page fully i18n.
- Daemon: optional `debug` logging for stick/MQTT forward behaviour (existing log level control).
- Docs & compliance: bilingual **DISCLAIMER.md** (community project, not official Marantec/Maveo, cloud/API may change anytime); README + DokuWiki template + overview UI link to it.
