# loxberry-maveo-connect

<p align="center">
  <img src="icons/icon_256.png" alt="Maveo Connect LoxBerry plugin icon (garage door + arrows)" width="128" height="128" />
</p>

[![CI](https://github.com/spid3r/loxberry-maveo-connect/actions/workflows/ci.yml/badge.svg)](https://github.com/spid3r/loxberry-maveo-connect/actions/workflows/ci.yml)
[![Release](https://github.com/spid3r/loxberry-maveo-connect/actions/workflows/release.yml/badge.svg)](https://github.com/spid3r/loxberry-maveo-connect/actions/workflows/release.yml)
[![Beta release](https://github.com/spid3r/loxberry-maveo-connect/actions/workflows/beta-release.yml/badge.svg)](https://github.com/spid3r/loxberry-maveo-connect/actions/workflows/beta-release.yml)

[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow.svg)](https://www.conventionalcommits.org/en/v1.0.0/)
[![semantic-release](https://img.shields.io/badge/semantic--release-e10079?logo=semantic-release&logoColor=white)](https://github.com/semantic-release/semantic-release)
[![Commitlint](https://img.shields.io/badge/commitlint-config--conventional-blue)](https://commitlint.js.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-339933?logo=nodedotjs&logoColor=white)](./package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](./tsconfig.json)
[![Playwright](https://img.shields.io/badge/Playwright-e2e-45ba4b?logo=playwright&logoColor=white)](./test-e2e/)
[![LoxBerry](https://img.shields.io/badge/LoxBerry-3.x-2d2d2d)](https://wiki.loxberry.de/)

LoxBerry 3 plugin that talks to a **Marantec Maveo Connect Stick** via the official
Marantec cloud (AWS Cognito + IoT MQTT) and exposes door / light state to LoxBerry
and (optionally) to Loxone via MQTT. Admin UI is **embedded** in the LoxBerry shell,
available in **German and English**.

**Disclaimer (read this):** This project is **not** official, **not** endorsed by
Marantec / Maveo, and **there is no support obligation** from them or from the
maintainers. It is a **community best-effort** tool that uses the same **cloud /
IoT path** as the official Maveo app (Cognito + MQTT). Marantec or Maveo may
**change, restrict, or discontinue** that integration **at any time** — the plugin
may then stop working without notice. Use **at your own risk**. Full text:
**[DISCLAIMER.md](./DISCLAIMER.md)** (German and English).

## Table of contents

- [Disclaimer](#disclaimer)
- [Features](#features)
- [Screenshots (admin UI)](#screenshots-admin-ui)
- [How it works](#how-it-works)
- [Installation](#installation)
- [Configuration](#configuration)
- [MQTT topics](#mqtt-topics)
- [Architecture](#architecture)
- [Building & development](#building--development)
- [Runtime compatibility](#runtime-compatibility)
- [Best-practice alignment](#best-practice-alignment)
- [License](#license)

## Disclaimer

The short paragraph at the top of this README is the executive summary. For the
full bilingual legal notice (no support, cloud/API changes, trademarks), see
**[DISCLAIMER.md](./DISCLAIMER.md)**.

## Features

- **Admin UI in German and English** — language picker in the page header, `?lang=de` /
  `?lang=en`, cookie, plugin setting, LoxBerry system language, `Accept-Language`;
  default **German**. Page is **embedded in the LoxBerry shell** like other plugins.
- **Simple by default** — only **email**, **password** and **thing** are visible on
  the *Settings* tab. Everything else (region, Cognito pool, test endpoints, MQTT
  forward, logging, daemon port, …) is hidden behind one **Advanced settings**
  expandable section.
- **Maveo Connect cloud login** with auto-discovery: pick the right Marantec stack
  (US-prod, US-test, EU-prod, EU-test) — **probe before save** lets you try EU vs US
  without committing a wrong config.
- **Live status & control** of door position and light from the *Status* tab (browser polls the daemon about every **2 seconds** — no WebSockets required on stock LoxBerry).
- **Optional MQTT forward** to Loxone or another broker: on **LoxBerry Mosquitto** (127.0.0.1:1883) the daemon resolves broker credentials the same way as [loxberry-api-abfall-io](https://github.com/spid3r/loxberry-api-abfall-io) (`general.json` / `cred.json` probe paths); three clean topics only (`door_position`, `door_label`, `light_on`).
- **LoxBerry-canonical daemon lifecycle** (LSB init script in `daemon/daemon`, sudoers
  for rootless restart, automatic restart-on-`Connection refused` from the PHP UI).
- **No hardcoded `/opt/loxberry` paths** in shell hooks: install/uninstall/sudoers use
  the LoxBerry `REPLACELBHOMEDIR` placeholder + `LBHOMEDIR` env so the plugin runs on
  any LoxBerry tree the appliance has been configured with.
- **Beautiful 3D plugin icons** auto-generated from two SVG masters
  (`icons/icon_source.svg` for the labelled overview tile, `icons/icon_source_without_text.svg`
  for the embedded admin glyph) — same squircle pipeline as the abfall.io plugin.

## Screenshots (admin UI)

Admin previews (**German and English**) live under [`docs/wiki-assets/`](./docs/wiki-assets/)
(`maveoconnect-overview-{de,en}.png`, `maveoconnect-status-{de,en}.png`, `maveoconnect-settings-{de,en}.png`).
They are captured **automatically** with Playwright against a real LoxBerry appliance — see
`npm run wiki:screenshots` (sets `E2E_LIVE=1` for that run — see [`scripts/wiki-screenshots.mjs`](./scripts/wiki-screenshots.mjs)),
`npm run wiki:screenshots:headed` to watch Chromium, or `npm run wiki:screenshots:ui` for the Playwright UI mode.
The generated DokuWiki page embeds the **German** trio by default; English assets ship in-repo for bilingual wikis — same layout as [`docs/WIKI_DOKUWIKI_START.txt`](./docs/WIKI_DOKUWIKI_START.txt) / `npm run wiki:generate`.
Full destructive E2E: [`scripts/run-e2e-full.mjs`](./scripts/run-e2e-full.mjs).

### German (DE)

<p align="center">
  <img src="docs/wiki-assets/maveoconnect-overview-de.png" width="820" alt="Maveo Connect — Overview tab (German)" />
</p>

<p align="center">
  <img src="docs/wiki-assets/maveoconnect-status-de.png" width="820" alt="Maveo Connect — Status tab (German)" />
</p>

<p align="center">
  <img src="docs/wiki-assets/maveoconnect-settings-de.png" width="820" alt="Maveo Connect — Settings tab with Loxone/MQTT help (German)" />
</p>

### English (EN)

<p align="center">
  <img src="docs/wiki-assets/maveoconnect-overview-en.png" width="820" alt="Maveo Connect — Overview tab (English)" />
</p>

<p align="center">
  <img src="docs/wiki-assets/maveoconnect-status-en.png" width="820" alt="Maveo Connect — Status tab (English)" />
</p>

<p align="center">
  <img src="docs/wiki-assets/maveoconnect-settings-en.png" width="820" alt="Maveo Connect — Settings tab with Loxone/MQTT help (English)" />
</p>

## How it works

1. **Web UI (PHP)** — embedded LoxBerry admin pages. Talks to the daemon over **localhost HTTP** with a
   shared `api_token.txt` (`X-Maveo-Token` header). The **Status** tab **polls** `status.php?ajax=1`
   about every **2 seconds** (simple and robust; `/api/status/wait` remains available for other tools).
   **No external JS/CSS CDNs**.
2. **Daemon (Node.js)** — single long-lived process bundled by **esbuild** to
   `bin/service.mjs`. Started by LoxBerry's standard init layout
   (`$LBHOMEDIR/system/daemons/plugins/maveoconnect`); the PHP UI can also restart it
   via `sudo` (rules in `sudoers/sudoers`, granted only to the canonical init script).
3. **Marantec cloud** — daemon uses **`maveo-connect-stick-client`** (AWS Cognito
   + IoT MQTT over WSS, SigV4 `iotdata`). State changes from the stick are forwarded
   live to the WebUI and (optionally) re-published to a local MQTT broker.

## Installation

### On a LoxBerry appliance

1. Download the latest plugin ZIP from
   [GitHub Releases](https://github.com/spid3r/loxberry-maveo-connect/releases).
2. **System → Plugins** → install.
3. Open plugin → **Einstellungen / Settings** → enter Maveo email + password →
   **Anmeldung prüfen / Test login** → pick the **thing** → **Save**.
4. **Status & Steuerung / Status & control** shows live door position and light;
   buttons drive open / close / stop / light on/off.

**German step-by-step (install, MQTT session, reclaim):** [docs/LOXBERRY_ANLEITUNG.md](./docs/LOXBERRY_ANLEITUNG.md) — same spirit as the [Abfall.io install troubleshooting](https://github.com/spid3r/loxberry-api-abfall-io/blob/main/docs/troubleshooting-plugin-install.md) doc for that plugin.

### Local development

Clone, `npm install`, `npm run typecheck`, `npm test`, `npm run release:zip`.
Full gate before push: `npm run verify` (typecheck + unit + ZIP build + ZIP layout
guard). Live deployment to a real appliance via the [`loxberry-client-library`](https://github.com/spid3r/loxberry-client-library)
CLI: see scripts under `npm run plugins:deploy` (uses `.env`).

## Configuration

### 1) Login (the only required step)

In *Einstellungen / Settings*:

- **E-Mail** + **Passwort** of the Maveo account
- **Anmeldung prüfen / Test login** — on success a green banner appears and the
  cloud's thing list is loaded into the dropdown (and the chip overview)
- Pick the thing in the **Auswahl aus der Cloud-Liste / Pick from cloud list**
- **Speichern / Save**

That is enough for the standard setup. The daemon picks up new credentials via a
`POST /api/reload` (no full restart; falls back to `sudo restart` if the listener
is dead).

### 2) Advanced (only when needed)

Inside the *Erweiterte Einstellungen / Advanced settings* `<details>` block:

- **Sprache / Language** — pin the admin UI language in `settings.json`
- **MQTT forward** to a local broker (LoxBerry Mosquitto **127.0.0.1:1883** or custom host,
  topic prefix; on the LoxBerry broker the daemon **auto-resolves** credentials like
  [loxberry-api-abfall-io](https://github.com/spid3r/loxberry-api-abfall-io) from `general.json` / `cred.json` paths — see the in-app hint under **Use LoxBerry broker**)
- **Cognito Identity Pool**, **Client ID**, **AWS region**, **IoT test endpoints** —
  for **EU** and/or **test** stack accounts that don't match the library defaults
  (`us-west-2 prod`)
- **Daemon-Port** (only when 47832 is taken) and **daemon log level**

The probe endpoint (`POST /api/maveo/probe`) **also** accepts these overrides as
request fields, so you can test EU vs US **before** committing them to disk.

## MQTT topics

When **MQTT forward** is enabled in *Settings → Advanced settings*, the daemon publishes
**non-retained** UTF-8 payloads to your broker (default prefix `maveo`, no trailing slash stored):

```text
<prefix>/door_position   ← door position code (integer 0…6, Maveo / BlueFi encoding)
<prefix>/door_label      ← English status token from the stick client (e.g. closed, open)
<prefix>/light_on        ← "1" or "0"
```

There is **no** combined `<prefix>/state` JSON topic: publishing it duplicated the same
values when the LoxBerry MQTT Gateway expands JSON into extra flat topics (`##` in names).

There are **no external CDN libraries** in the plugin web UI — only embedded CSS/JS and LoxBerry shell assets.

### Loxone (minimal setup)

1. In the plugin: enable **MQTT forward**, use **LoxBerry Mosquitto** (127.0.0.1:1883) or the same broker your Miniserver already uses.
2. Pick a **topic prefix** you like (default `maveo` → topics `maveo/door_position`, …).
3. In **Loxone Config**, add an **MQTT** device / connection pointing at that broker (host, port; credentials only if you configured them on Mosquitto).
4. Subscribe to the topics above, for example:
   - **Virtual input (digital)** on `…/light_on` — map incoming text `1` / `0` (or use a small conversion if your Loxone build expects different comparators).
   - **Virtual input (analog)** or **status** on `…/door_position` — integer 0…6; optionally drive icons or logic from `…/door_label`.
5. Open/close **commands** from Loxone are sent **over HTTP**, not MQTT — see *Loxone control via Virtual Outputs* below. The MQTT channel intentionally stays status-only.

#### Door position codes (`door_position` / `status.php`)

| Code | Label | Meaning |
|------|-------|---------|
| 0 | `stopped` | Motor stopped between end positions |
| 1 | `opening` | Door opening |
| 2 | `closing` | Door closing |
| 3 | `open` | Fully open |
| 4 | `closed` | Fully closed |
| 5 | `intermediateOpen` | Intermediate / ventilation position |
| 6 | `intermediateClosed` | Intermediate position toward closed |

For a Loxone status block: `open = 3 or 5`, `closed = 4`, `moving = 1 or 2`. `light_on` is `1`/`0`.

### Loxone control via Virtual Outputs

The plugin exposes a small, **opt-in HTTP API** under the standard LoxBerry plugin path. The Miniserver hits these URLs from a Virtual Output — there is **no extra port** to open, the Node daemon stays bound to `127.0.0.1` and the internal token never leaves the LoxBerry.

1. In **Settings → MQTT & Loxone integration** turn on **Loxone control API** and save (off by default).
2. In **Loxone Config**, add a **Virtual Output** for each command. Authentication uses the **standard LoxBerry plugin Basic Auth** sent inline in the URL.
3. Endpoints (replace `LB-IP` with your LoxBerry's IP / hostname; `loxberry:loxberry` with your LoxBerry plugin credentials):

```text
http://loxberry:loxberry@LB-IP/admin/plugins/maveoconnect/api/door.php?cmd=open
http://loxberry:loxberry@LB-IP/admin/plugins/maveoconnect/api/door.php?cmd=close
http://loxberry:loxberry@LB-IP/admin/plugins/maveoconnect/api/door.php?cmd=stop
http://loxberry:loxberry@LB-IP/admin/plugins/maveoconnect/api/door.php?cmd=ventilate
http://loxberry:loxberry@LB-IP/admin/plugins/maveoconnect/api/light.php?state=on
http://loxberry:loxberry@LB-IP/admin/plugins/maveoconnect/api/light.php?state=off
http://loxberry:loxberry@LB-IP/admin/plugins/maveoconnect/api/light.php?state=toggle
http://loxberry:loxberry@LB-IP/admin/plugins/maveoconnect/api/reclaim.php
http://loxberry:loxberry@LB-IP/admin/plugins/maveoconnect/api/status.php
```

Successful actions return HTTP `200` with the body `OK`; failures return `4xx`/`5xx` with `ERR <message>`. While the toggle is off, every endpoint replies `503 disabled`. `status.php` returns a compact JSON snapshot — useful as a fallback for setups without an MQTT broker:

```json
{"doorPosition":3,"doorLabel":"open","lightOn":false,"mqttConnected":true,"stickSerial":"…","lastError":null}
```

Don't expose this URL space to the open internet — Basic Auth is fine inside a home network, which is the LoxBerry default.

Door movement is reflected as soon as the Marantec cloud pushes stick state; the admin **Status** page **polls** the daemon about every **2 seconds** so the UI stays fresh without WebSockets. Long-poll (`/api/status/wait`) is still implemented server-side for optional use; the bundled UI prefers simple polling for fewer moving parts behind Apache.

## Architecture

**Stack:** TypeScript (Node ≥ 20), ESM, **esbuild** → `service/dist/service.mjs`,
mirrored into the ZIP as `bin/service.mjs`. **PHP** admin (`webfrontend/htmlauth/`)
for UI; communicates with the daemon over `127.0.0.1:47832` with `X-Maveo-Token`.
**i18n:** `i18n.php` + `templates/lang/language_*.ini`. **Tests:** Mocha (`test-ts/`);
optional Playwright in `test-e2e/`.

### Runtime data flow (simplified)

```mermaid
flowchart TB
  subgraph Admin["Admin UI (PHP)"]
    UI[htmlauth: index / status / settings / log]
  end
  CFG["$LBHOMEDIR/config/plugins/maveoconnect/settings.json"]
  TOKEN["api_token.txt (PHP ↔ Node shared secret)"]
  INIT["LSB init script — $LBHOMEDIR/system/daemons/plugins/maveoconnect"]
  subgraph Daemon["Daemon (Node)"]
    D[service.mjs — long-lived]
  end
  subgraph Cloud["Marantec cloud"]
    COG["AWS Cognito (login)"]
    IOT["AWS IoT MQTT (WSS, SigV4 iotdata)"]
  end
  STICK["Maveo Connect Stick (garage)"]
  subgraph Out["Outputs"]
    LIVE[Live UI on Status & control]
    MQTT[MQTT topics → Loxone / HA]
  end
  UI --> CFG
  UI -- "X-Maveo-Token" --> D
  CFG --> D
  TOKEN --> UI
  TOKEN --> D
  INIT --> D
  D --> COG
  COG --> IOT
  IOT <--> STICK
  IOT --> D
  D --> LIVE
  D --> MQTT
```

### Development & release (overview)

```mermaid
flowchart LR
  subgraph Local["Local"]
    E[Edit TS / PHP / SVG icon]
    T["npm run verify (typecheck + test + zip + verify:zip)"]
  end
  subgraph GitHub["GitHub"]
    PR[PR / push]
    CI[CI workflow]
  end
  subgraph Branches["Branches"]
    M[main]
    B[beta]
  end
  E --> T --> PR --> CI
  CI --> M
  CI --> B
  M --> SR["semantic-release → stable + CHANGELOG + release.cfg"]
  B --> BR["beta-release.mjs → {stable}-beta.N + prerelease.cfg"]
  SR --> ZIP[GitHub Release: ZIP asset]
  BR --> ZIPB[GitHub prerelease: ZIP asset]
```

**Branch policy:**

- **`main`** is bumped by [`semantic-release`](https://github.com/semantic-release/semantic-release)
  from conventional commits → stable `vX.Y.Z` tag, **`release.cfg`** updated, GitHub
  Release with the plugin ZIP attached.
- **`beta`** runs [`scripts/beta-release.mjs`](./scripts/beta-release.mjs) — version
  is always `{latest stable}-beta.N`; only `N` increments. **`prerelease.cfg`** is
  the autoupdate pointer for beta testers; CHANGELOG also gets a beta block.

## Building & development

```bash
npm install
npm run release:zip
```

Runs `build:icons` (Sharp + 3D squircle pipeline), then `build` (esbuild bundle of
`service/src/service.ts` → `service/dist/service.mjs`), then
[`scripts/build-release.mjs`](./scripts/build-release.mjs) which packages everything
under the canonical LoxBerry layout into
`dist/loxberry-plugin-maveoconnect-<version>.zip`.

Icon sources: `icons/icon_source.svg` (overview, with label text) and
`icons/icon_source_without_text.svg` (admin header glyph). The script writes
PNGs back to `icons/icon_*.png` and `webfrontend/htmlauth/icon_64.png` —
`plugin.cfg` points `ICON=icon_64.png` at the latter.

### npm scripts you'll actually use

| Script | Role |
|--------|------|
| `npm run verify` | typecheck + unit + ZIP + verify ZIP layout (CI gate) |
| `npm run release:zip` | end-to-end: icons + bundle + ZIP |
| `npm run verify:zip` | sanity-check the ZIP (no dev junk; required paths present) |
| `npm run release:dry-run` | preview the next stable semver without publishing |
| `npm run release:beta` | (CI lane) tag + push `vX.Y.Z-beta.N` + GitHub prerelease |
| `npm run plugins:deploy` | install/upgrade the ZIP on the appliance via `loxberry-client` |
| `npm run wiki:build` | generate + validate the LoxWiki DokuWiki start page |

## Runtime compatibility

- Node.js ≥ 20 on the dev host; LoxBerry 3 ships Node 18+ — the bundle is ES2022 +
  `createRequire` shim for AWS SDK CJS modules and runs cleanly on Node 18.
- Release ZIP excludes dev-only paths and the SVG icon masters; ships PNGs in
  `icons/` and `webfrontend/htmlauth/icon_64.png` only.
- Architecture: `raspberry,x86` (declared in `plugin.cfg`); `LB_MINIMUM=3.0.0`.

## Best-practice alignment

- LoxBerry layout: `plugin.cfg`, `webfrontend/`, `templates/lang/`, `bin/service.mjs`,
  `daemon/daemon`, `sudoers/sudoers`, `uninstall/uninstall`, install hooks
  (`postinstall`, `postroot`, `preupgrade`, `postupgrade`).
- No hardcoded `/opt/loxberry` paths in any installed file (sudoers uses
  `REPLACELBHOMEDIR`, daemon resolves `LBHOMEDIR` from its own location, uninstall
  uses `${LBHOMEDIR}` only).
- Conventional Commits + commitlint + semantic-release; explicit beta lane modeled
  after [`loxberry-api-abfall-io`](https://github.com/spid3r/loxberry-api-abfall-io).
- Icon pipeline copied 1:1 from the abfall.io plugin so both plugins look identical
  in the LoxBerry overview / system images.
- LoxBerry developer references:
  [LoxBerry Developer](https://wiki.loxberry.de/entwickler/start),
  [Node.js plugins](https://wiki.loxberry.de/entwickler/node_js_plugin_entwicklung).

## License

MIT — see [LICENSE](LICENSE).
