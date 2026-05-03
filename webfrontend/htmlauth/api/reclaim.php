<?php
/**
 * Loxone-friendly "reclaim MQTT session" trigger.
 *
 *   GET (no params)
 *
 * Equivalent to the "MQTT neu verbinden" / "Session von App zurückholen" buttons
 * on the Status & control page, i.e. `POST /api/reconnect` on the daemon. Useful
 * to wire to a Loxone scene that runs after the household leaves so the LoxBerry
 * grabs the MQTT session back from the Maveo app on the way home.
 */

require_once __DIR__ . '/_loxone_common.php';

maveoconnect_lox_require_enabled();

$r = maveoconnect_daemon_request('POST', '/api/reconnect', null);
maveoconnect_lox_forward_result($r);
