<?php
/**
 * Loxone-friendly garage light endpoint.
 *
 *   GET ?state=on     → switch light on
 *   GET ?state=off    → switch light off
 *   GET ?state=toggle → flip the current state
 *
 * `toggle` is implemented in PHP (not in the daemon) so the protocol stays
 * stateless — we ask the daemon for a fresh snapshot, invert `lightOn`, then
 * publish. If the snapshot does not yet contain a known light state (cold
 * start), we default to ON so the user is not stuck with "nothing happens".
 */

require_once __DIR__ . '/_loxone_common.php';

maveoconnect_lox_require_enabled();

$state = maveoconnect_lox_arg('state');
if (!in_array($state, ['on', 'off', 'toggle', '1', '0'], true)) {
    maveoconnect_lox_send_text(400, "ERR invalid state, expected: on, off, toggle");
}

if ($state === '1') {
    $state = 'on';
} elseif ($state === '0') {
    $state = 'off';
}

$desiredOn = null;
if ($state === 'on') {
    $desiredOn = true;
} elseif ($state === 'off') {
    $desiredOn = false;
} else {
    /** toggle: refresh state first so we don't fight a stale snapshot, then read. */
    maveoconnect_daemon_request('POST', '/api/refresh-state', null);
    $st = maveoconnect_daemon_request('GET', '/api/status');
    if (!empty($st['ok']) && array_key_exists('lightOn', $st)) {
        $current = $st['lightOn'];
        if ($current === true || $current === 1 || $current === '1') {
            $desiredOn = false;
        } elseif ($current === false || $current === 0 || $current === '0') {
            $desiredOn = true;
        }
    }
    if ($desiredOn === null) {
        /** Unknown current state → bias to ON so the toggle still produces a visible action. */
        $desiredOn = true;
    }
}

$r = maveoconnect_daemon_request('POST', '/api/light', ['on' => $desiredOn]);
maveoconnect_lox_forward_result($r);
