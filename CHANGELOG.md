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
