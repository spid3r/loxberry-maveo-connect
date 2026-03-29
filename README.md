# LoxBerry Maveo Connect

LoxBerry **3.x** plugin that runs a **Node.js** daemon (MQTT to Marantec / Maveo) and a **PHP** UI for settings, status, manual controls, and optional forwarding to a **local MQTT broker** (for example Loxone virtual inputs).

- **LoxBerry**: minimum version **3.0.0** (see `plugin.cfg`).
- **Client library**: [maveo-connect-stick-client](maveo-connect-stick-client/) (git submodule). Credential and protocol fields match [`maveo-connect-stick-client/.env.example`](maveo-connect-stick-client/.env.example).

## Build & ZIP (developer)

```bash
npm install
npm run build    # compile submodule + daemon
npm run pack     # dist/maveoconnect-LOXBERRY.zip
```

Upload the ZIP in the LoxBerry plugin manager. A prebuilt ZIP from `npm run pack` ships **one bundled file** `daemon/dist/service.mjs` (~3.5MB, esbuild) — **no** `node_modules` on the device and **no** `npm ci` during install (fast). Icons are generated into `icons/` when you run `pack`.

## LoxBerry lifecycle scripts

| Script | When | Role |
|--------|------|------|
| `daemon.sh` | Plugin start/stop in UI | Starts or stops the Node service (`start` / `stop` / `restart` / `status`). |
| `postinstall.sh` | After every install | Verifies `daemon/dist/service.mjs` exists (bundled daemon). |
| `postupgrade.sh` | After an **update** only | Same check; reminder to restart the daemon. Extend for settings migrations if needed. |
| `postroot.sh` | After install (as **root**) | Creates `config/plugins/maveoconnect/`, `api_token.txt` if missing, tightens permissions. |
| `uninstall/uninstall` | On **uninstall** only (not update) | Stops the daemon and removes the pidfile; LoxBerry then removes plugin files and logs. |

See the [LoxBerry plugin developer wiki](https://wiki.loxberry.de/entwickler/plugin_fur_den_loxberry_entwickeln_ab_version_1x/start) for argument lists (`$3` = plugin install directory, etc.).

Shell scripts (`.sh`, `daemon.sh`, `uninstall/uninstall`) must use **Unix LF** line endings; **CRLF breaks the shebang** on the Pi and can yield a blank `POSTINSTALL` / `POSTROOT` error. This repo uses [`.gitattributes`](.gitattributes) so Git checks them out with LF.

## Install on LoxBerry

1. Install the plugin from the ZIP.
2. Open **Maveo Connect → Settings**, enter Maveo credentials and stick serial, **Save** (creates `api_token.txt` and `settings.json` under `$LBHOMEDIR/config/plugins/maveoconnect/` on the appliance).
3. Start the plugin daemon from LoxBerry plugin management (or `./daemon.sh start` with `LBHOMEDIR` set).
4. Use **Status** for live state, reconnect, and door/light actions.

Restart the daemon after changing credentials, port, or MQTT-forward settings.

## MQTT topics (forwarding)

When **MQTT forward** is enabled, the daemon publishes **non-retained** messages under your prefix:

- `{prefix}/door_position` — numeric `MaveoDoorPosition` (0–6)
- `{prefix}/door_label` — string (e.g. `open`, `closed`)
- `{prefix}/light_on` — `0` or `1`

## Security

The Node API listens on **127.0.0.1** only and requires the **X-Maveo-Token** header (shared secret in `api_token.txt`). The browser talks to the daemon only through PHP on the LoxBerry host.

## Session contention

Only **one** MQTT client may use the Connect Stick serial at a time. Close the official Maveo app on phones if you want a stable plugin connection; see the submodule README for reclaim and contention behaviour.
