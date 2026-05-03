<?php
/**
 * Loxone-friendly garage door endpoint.
 *
 *   GET ?cmd=open      → fully open
 *   GET ?cmd=close     → fully close
 *   GET ?cmd=stop      → stop the running motor
 *   GET ?cmd=ventilate → ventilation / partial-open position (depends on motor)
 *
 * Auth is the standard LoxBerry plugin Basic Auth (handled by Apache).
 * Map this URL to a Loxone Virtual Output, e.g.:
 *   http://loxberry:loxberry@LOXBERRY-IP/admin/plugins/maveoconnect/api/door.php?cmd=open
 *
 * Wraps `POST /api/door` on the local Node daemon (`127.0.0.1:47832`); the
 * daemon's `X-Maveo-Token` is added in PHP so it never leaves the LoxBerry.
 */

require_once __DIR__ . '/_loxone_common.php';

maveoconnect_lox_require_enabled();

$cmd = maveoconnect_lox_arg('cmd');
$allowed = ['open', 'close', 'stop', 'ventilate'];
if (!in_array($cmd, $allowed, true)) {
    maveoconnect_lox_send_text(400, "ERR invalid cmd, expected one of: open, close, stop, ventilate");
}

$r = maveoconnect_daemon_request('POST', '/api/door', ['command' => $cmd]);
maveoconnect_lox_forward_result($r);
