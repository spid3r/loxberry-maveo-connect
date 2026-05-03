<?php
/**
 * Shared helper for the Loxone-friendly control endpoints under
 * `webfrontend/htmlauth/api/*.php`.
 *
 * Why a thin PHP wrapper instead of exposing the Node daemon directly to LAN:
 * - The daemon's HTTP API uses an `X-Maveo-Token` header (rotating secret in
 *   `api_token.txt`). Pushing that token into a Loxone Virtual Output config
 *   would leak it on every save / export — and force a re-edit if we ever
 *   rotate it. The PHP layer reads the token fresh on each request, so the
 *   token stays internal.
 * - LoxBerry's Apache already protects `htmlauth/` with the standard plugin
 *   Basic Auth — the same protection every other plugin tab uses. The Miniserver
 *   sends those credentials inline (`http://loxberry:loxberry@host/...`).
 * - Daemon stays bound to `127.0.0.1`; no extra LAN attack surface.
 *
 * The opt-in toggle in `settings.json` (`loxoneApi.enabled`) is enforced here:
 * if disabled (or missing), every endpoint returns HTTP 503 + `disabled` so
 * accidental Miniserver requests do not silently move the door.
 */

require_once __DIR__ . '/../loxberry_bootstrap.php';
require_once __DIR__ . '/../maveo_paths.php';

/** Always plain text by default — Loxone's Virtual Output parses short bodies easily. */
function maveoconnect_lox_send_text(int $http, string $body): void
{
    http_response_code($http);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    header('Pragma: no-cache');
    echo $body;
    exit;
}

function maveoconnect_lox_send_json(int $http, array $payload): void
{
    http_response_code($http);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    header('Pragma: no-cache');
    $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    echo $json === false ? '{"ok":false,"error":"json_encode failed"}' : $json;
    exit;
}

/**
 * Return true if the user enabled "Loxone-API" in plugin settings. Otherwise
 * short-circuit with HTTP 503.
 */
function maveoconnect_lox_require_enabled(): void
{
    $s = maveoconnect_load_settings_array();
    $enabled = !empty($s['loxoneApi']['enabled']);
    if (!$enabled) {
        maveoconnect_lox_send_text(503, "disabled\nEnable the Loxone API in the plugin settings (Status & control / MQTT & Loxone).");
    }
}

/**
 * Normalize whatever Loxone sent for the action argument. Loxone Virtual Output
 * configs sometimes URL-encode parameter values, sometimes uppercase them.
 */
function maveoconnect_lox_arg(string $key, string $default = ''): string
{
    $v = $_GET[$key] ?? $default;
    if (!is_string($v)) {
        return $default;
    }
    return strtolower(trim($v));
}

/**
 * Forward a daemon call result to the Loxone client as plain text.
 *
 * The Node daemon's success path returns `{"ok": true}` (HTTP 200) — we collapse
 * that to a `OK` body for simple Loxone status mapping. On failure we surface
 * the daemon error message (truncated) so the user sees something actionable in
 * the LoxBerry Apache log.
 */
function maveoconnect_lox_forward_result(array $r): void
{
    if (!empty($r['ok'])) {
        maveoconnect_lox_send_text(200, 'OK');
    }
    $http = (int) ($r['_http'] ?? 0);
    $err = (string) ($r['error'] ?? ($r['message'] ?? 'daemon error'));
    if ($err === '') {
        $err = 'daemon error';
    }
    if (strlen($err) > 240) {
        $err = substr($err, 0, 240) . '…';
    }
    /** Map daemon's 503 (`client_not_ready`) to the same code outward so Loxone
     *  can distinguish "daemon up but not configured" from a real outage. */
    $outHttp = $http >= 400 && $http <= 599 ? $http : 502;
    maveoconnect_lox_send_text($outHttp, 'ERR ' . $err);
}
