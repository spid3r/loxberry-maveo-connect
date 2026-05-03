<?php
/**
 * Loxone-friendly compact status JSON.
 *
 *   GET (no params)
 *
 * Returns a small, stable subset of the daemon's `/api/status` snapshot — the
 * fields a Loxone HTTP-poll input typically needs:
 *
 *   {
 *     "doorPosition": 0..6 | null,        // 0 stopped, 1 opening, 2 closing,
 *                                          // 3 open, 4 closed, 5 intermediateOpen,
 *                                          // 6 intermediateClosed
 *     "doorLabel":    string | null,       // english token (e.g. "open")
 *     "lightOn":      true | false | null,
 *     "mqttConnected": bool,
 *     "sessionTakeover": bool,            // true while the Maveo app appears
 *                                          // to have stolen the session — drive
 *                                          // a Logikbaustein → reclaim.php off this
 *     "transport": string,                 // "connected"|"connecting"|
 *                                          // "disconnected"|"reconnecting" …
 *     "backoffUntilMs": number,            // > 0 ⇒ auto-reclaim is paused
 *                                          // (manual reclaim still works)
 *     "stickSerial":   string | null,
 *     "lastError":     string | null
 *   }
 *
 * The MQTT forward path remains the recommended way to bring values into Loxone
 * (push-based, near-instant; same data lives under `<prefix>/mqtt_connected`,
 * `<prefix>/session_takeover`, `<prefix>/transport`, `<prefix>/backoff_until_ms`).
 * This endpoint is provided as a fallback for setups without a broker, or to
 * drive a poll-based status block.
 */

require_once __DIR__ . '/_loxone_common.php';

maveoconnect_lox_require_enabled();

$r = maveoconnect_daemon_request('GET', '/api/status');

if (empty($r['ok'])) {
    /** Return whatever the daemon told us so a Loxone status block sees a real
     *  HTTP error rather than a partially-empty 200 body. */
    $http = (int) ($r['_http'] ?? 0);
    maveoconnect_lox_send_json($http >= 400 && $http <= 599 ? $http : 502, [
        'ok' => false,
        'error' => (string) ($r['error'] ?? 'daemon error'),
    ]);
}

$sessionLoss = isset($r['sessionLoss']) && is_array($r['sessionLoss']) ? $r['sessionLoss'] : null;
$sessionTakeover = is_array($sessionLoss) && !empty($sessionLoss['suspectedRemoteSessionTakeover']);

$out = [
    'doorPosition' => array_key_exists('doorPosition', $r) ? $r['doorPosition'] : null,
    'doorLabel' => array_key_exists('doorLabel', $r) ? $r['doorLabel'] : null,
    'lightOn' => array_key_exists('lightOn', $r) ? $r['lightOn'] : null,
    'mqttConnected' => !empty($r['mqttConnected']),
    'sessionTakeover' => $sessionTakeover,
    'transport' => isset($r['transport']) && is_string($r['transport']) ? $r['transport'] : 'unknown',
    'backoffUntilMs' => isset($r['backoffUntilMs']) && is_numeric($r['backoffUntilMs']) ? (int) $r['backoffUntilMs'] : 0,
    'stickSerial' => array_key_exists('stickSerial', $r) ? $r['stickSerial'] : null,
    'lastError' => array_key_exists('lastError', $r) ? $r['lastError'] : null,
];
maveoconnect_lox_send_json(200, $out);
