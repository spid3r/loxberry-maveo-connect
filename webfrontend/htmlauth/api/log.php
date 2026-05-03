<?php
/**
 * Loxone-friendly log diagnostics endpoint.
 *
 *   GET /api/log.php                 → JSON: { ok, level, lines: [...] }
 *   GET /api/log.php?fmt=text&lines=N → plain text with the last N lines (good for
 *                                      Loxone "URL-Befehl" / Webview blocks where
 *                                      the user wants a quick tail without JSON parsing)
 *   GET /api/log.php?level=debug     → switch the *runtime* log level
 *                                      (one of error / warn / info / debug);
 *                                      not persisted, restart restores settings.json
 *
 * Why GET-only for the level setter: Loxone Virtual Outputs only do GET requests.
 * Hidden behind LoxBerry's standard Apache Basic Auth + the opt-in `loxoneApi.enabled`
 * switch, so accidental third-party crawlers cannot flip you to debug.
 *
 * Typical Loxone use: a virtual button "Diagnose-Modus EIN" that calls
 * `…/api/log.php?level=debug`, a second one "AUS" that calls `…/api/log.php?level=info`,
 * and (optionally) a Webview block pointing at `…/api/log.php?fmt=text&lines=80` so
 * you can read the last lines straight from the Loxone app.
 */

require_once __DIR__ . '/_loxone_common.php';

maveoconnect_lox_require_enabled();

$levelArg = maveoconnect_lox_arg('level', '');
if ($levelArg !== '') {
    $allowed = ['error', 'warn', 'info', 'debug'];
    if (!in_array($levelArg, $allowed, true)) {
        maveoconnect_lox_send_text(
            400,
            "ERR invalid_level\nallowed: " . implode(', ', $allowed)
        );
    }
    $r = maveoconnect_daemon_request('POST', '/api/log/level', ['level' => $levelArg]);
    if (!empty($r['ok'])) {
        $previous = isset($r['previous']) ? (string) $r['previous'] : '';
        maveoconnect_lox_send_text(200, 'OK level=' . $levelArg . ($previous !== '' ? ' (was ' . $previous . ')' : ''));
    }
    maveoconnect_lox_forward_result($r);
}

$linesParam = isset($_GET['lines']) ? (int) $_GET['lines'] : 0;
$limit = $linesParam > 0 ? min(520, max(1, $linesParam)) : 60;

$r = maveoconnect_daemon_request('GET', '/api/log/recent?limit=' . $limit);
if (empty($r['ok'])) {
    /** Mirror the same shape status.php uses so a Loxone HTTP-status block can
     *  still distinguish "daemon down" from "daemon up but disabled". */
    $http = (int) ($r['_http'] ?? 0);
    if ((maveoconnect_lox_arg('fmt') === 'text')) {
        maveoconnect_lox_send_text(
            $http >= 400 && $http <= 599 ? $http : 502,
            'ERR ' . (string) ($r['error'] ?? 'daemon error')
        );
    }
    maveoconnect_lox_send_json($http >= 400 && $http <= 599 ? $http : 502, [
        'ok' => false,
        'error' => (string) ($r['error'] ?? 'daemon error'),
    ]);
}

$level = isset($r['logLevel']) && is_string($r['logLevel']) ? $r['logLevel'] : 'info';
$lines = isset($r['lines']) && is_array($r['lines']) ? $r['lines'] : [];
/** Limit again on the PHP side in case the daemon ignored our limit param. */
if (count($lines) > $limit) {
    $lines = array_slice($lines, -$limit);
}

if (maveoconnect_lox_arg('fmt') === 'text') {
    /** Plain text wins over JSON for tiny Loxone webview / status blocks. */
    $body = "level: " . $level . "\n";
    $body .= "lines: " . count($lines) . " (last " . $limit . ")\n";
    $body .= str_repeat('-', 40) . "\n";
    $body .= implode("\n", $lines);
    maveoconnect_lox_send_text(200, $body);
}

maveoconnect_lox_send_json(200, [
    'ok' => true,
    'level' => $level,
    'count' => count($lines),
    'lines' => $lines,
]);
