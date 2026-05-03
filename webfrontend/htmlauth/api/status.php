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
 *     "stickSerial":   string | null,
 *     "lastError":     string | null
 *   }
 *
 * The MQTT forward path remains the recommended way to bring values into Loxone
 * (push-based, near-instant). This endpoint is provided as a fallback for setups
 * without a broker, or to drive a poll-based status block.
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

$out = [
    'doorPosition' => array_key_exists('doorPosition', $r) ? $r['doorPosition'] : null,
    'doorLabel' => array_key_exists('doorLabel', $r) ? $r['doorLabel'] : null,
    'lightOn' => array_key_exists('lightOn', $r) ? $r['lightOn'] : null,
    'mqttConnected' => !empty($r['mqttConnected']),
    'stickSerial' => array_key_exists('stickSerial', $r) ? $r['stickSerial'] : null,
    'lastError' => array_key_exists('lastError', $r) ? $r['lastError'] : null,
];
maveoconnect_lox_send_json(200, $out);
