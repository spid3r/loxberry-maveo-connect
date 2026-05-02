<?php
/**
 * Shared paths for Maveo Connect.
 * Requires loxberry_bootstrap.php first (loxberry_system sets $lbpconfigdir, $lbhomedir, …).
 */
$MAVOECONNECT_NAME = 'maveoconnect';

if (isset($lbpconfigdir) && is_string($lbpconfigdir) && $lbpconfigdir !== '') {
    $MAVOECONNECT_CONFIG_DIR = $lbpconfigdir;
} elseif (isset($lbhomedir) && is_string($lbhomedir) && $lbhomedir !== '') {
    $MAVOECONNECT_CONFIG_DIR = $lbhomedir . '/config/plugins/' . $MAVOECONNECT_NAME;
} else {
    $MAVOECONNECT_CONFIG_DIR = '';
}

$MAVOECONNECT_SETTINGS = $MAVOECONNECT_CONFIG_DIR !== '' ? $MAVOECONNECT_CONFIG_DIR . '/settings.json' : '';
$MAVOECONNECT_API_TOKEN_FILE = $MAVOECONNECT_CONFIG_DIR !== '' ? $MAVOECONNECT_CONFIG_DIR . '/api_token.txt' : '';

/**
 * EU-central-1 prod Marantec stack defaults — also baked into the Node service
 * (`service/src/maveoStackDefaults.ts`). Keep both files in sync if Marantec
 * rotates these IDs; the upstream `maveo-connect-stick-client` library purposely
 * does not ship vendor defaults (so we do, in the LoxBerry plugin layer).
 *
 * Strings are base64-encoded so the vendor literals (Cognito pool ID,
 * client ID, IoT broker hostname) do not show up in GitHub keyword searches /
 * scrapers. This is deterrent obfuscation, NOT a security control — these IDs
 * are publicly observable on every TLS handshake the official Maveo mobile
 * app makes.
 */
if (!defined('MAVOECONNECT_LIB_DEFAULT_POOL')) {
    define('MAVOECONNECT_LIB_DEFAULT_POOL', base64_decode('ZXUtY2VudHJhbC0xOmIzZWJlNjA1LTUzYzktNDYzZS04NzM4LTcwYWUwMWIwNDJlZQ=='));
}
if (!defined('MAVOECONNECT_LIB_DEFAULT_CLIENT_ID')) {
    define('MAVOECONNECT_LIB_DEFAULT_CLIENT_ID', base64_decode('MzRlcnVxaHZ2bm5paWc1YmNjcnJlNnMwY2s='));
}
if (!defined('MAVOECONNECT_LIB_DEFAULT_REGION')) {
    define('MAVOECONNECT_LIB_DEFAULT_REGION', base64_decode('ZXUtY2VudHJhbC0x'));
}
if (!defined('MAVOECONNECT_LIB_DEFAULT_IOT_HOSTNAME')) {
    define('MAVOECONNECT_LIB_DEFAULT_IOT_HOSTNAME', base64_decode('ZXUtY2VudHJhbC0xLmlvdC1wcm9kLm1hcmFudGVjLWNsb3VkLmRl'));
}

function maveoconnect_load_settings_array(): array
{
    global $MAVOECONNECT_SETTINGS;
    if ($MAVOECONNECT_SETTINGS === '' || !is_readable($MAVOECONNECT_SETTINGS)) {
        return [];
    }
    $raw = file_get_contents($MAVOECONNECT_SETTINGS);
    if ($raw === false) {
        return [];
    }
    $j = json_decode($raw, true);
    return is_array($j) ? $j : [];
}

function maveoconnect_daemon_port(array $settings): int
{
    $p = $settings['daemon']['port'] ?? 47832;
    $p = (int) $p;
    if ($p < 1024 || $p > 65535) {
        return 47832;
    }
    return $p;
}

function maveoconnect_api_token(): ?string
{
    global $MAVOECONNECT_API_TOKEN_FILE;
    if ($MAVOECONNECT_API_TOKEN_FILE === '' || !is_readable($MAVOECONNECT_API_TOKEN_FILE)) {
        return null;
    }
    $t = trim((string) file_get_contents($MAVOECONNECT_API_TOKEN_FILE));
    return $t !== '' ? $t : null;
}

/** Legt api_token.txt an oder erneuert sie, wenn sie fehlt, leer oder für PHP unlesbar ist. */
function maveoconnect_ensure_api_token(): void
{
    global $MAVOECONNECT_API_TOKEN_FILE;
    if ($MAVOECONNECT_API_TOKEN_FILE === '') {
        return;
    }
    $ok = false;
    if (is_readable($MAVOECONNECT_API_TOKEN_FILE)) {
        $t = trim((string) file_get_contents($MAVOECONNECT_API_TOKEN_FILE));
        $ok = $t !== '';
    }
    if ($ok) {
        return;
    }
    if (function_exists('random_bytes')) {
        $t = bin2hex(random_bytes(32));
    } else {
        $t = bin2hex(openssl_random_pseudo_bytes(32));
    }
    file_put_contents($MAVOECONNECT_API_TOKEN_FILE, $t);
    /** Lesbar für Plugin-Apache + Node-Daemon; Request nur localhost + Header. */
    @chmod($MAVOECONNECT_API_TOKEN_FILE, 0644);
}

/**
 * Path to the LoxBerry-installed init script (renamed from daemon/daemon during install).
 * Sudoers ships with the same NOPASSWD line, so PHP can call this without a password.
 */
function maveoconnect_init_script_path(): string
{
    global $lbhomedir;
    $lbh = '';
    if (isset($lbhomedir) && is_string($lbhomedir) && $lbhomedir !== '') {
        $lbh = $lbhomedir;
    } elseif (!empty($_SERVER['LBHOMEDIR'])) {
        $lbh = (string) $_SERVER['LBHOMEDIR'];
    } elseif (getenv('LBHOMEDIR')) {
        $lbh = (string) getenv('LBHOMEDIR');
    } else {
        $lbh = '/opt/loxberry';
    }
    return rtrim($lbh, '/') . '/system/daemons/plugins/maveoconnect';
}

/**
 * Run a verb against the init script via sudo (allowed by sudoers/sudoers).
 * Returns ['ok'=>bool, 'output'=>string, 'verb'=>string].
 *
 * @param 'start'|'stop'|'restart'|'reload'|'status' $verb
 */
function maveoconnect_daemon_control(string $verb): array
{
    $allowed = ['start', 'stop', 'restart', 'reload', 'status'];
    if (!in_array($verb, $allowed, true)) {
        return ['ok' => false, 'output' => 'invalid verb', 'verb' => $verb];
    }
    $script = maveoconnect_init_script_path();
    if (!is_file($script)) {
        return ['ok' => false, 'output' => 'init script missing: ' . $script, 'verb' => $verb];
    }

    $cmd = '/usr/bin/sudo -n ' . escapeshellarg($script) . ' ' . escapeshellarg($verb) . ' 2>&1';
    $output = [];
    $code = 0;
    @exec($cmd, $output, $code);

    return [
        'ok' => $code === 0,
        'output' => trim(implode("\n", $output)),
        'verb' => $verb,
        'code' => $code,
    ];
}

function maveoconnect_daemon_restart(): array
{
    return maveoconnect_daemon_control('restart');
}

function maveoconnect_daemon_status_script(): array
{
    return maveoconnect_daemon_control('status');
}

/**
 * @param array<string,mixed>|null $jsonBody Object to JSON-encode, or null for empty JSON object on POST/PUT.
 *
 * On Connection-Refused (port 47832) we transparently try ONE sudo restart and re-issue
 * the request. That heals the very common case where the daemon stopped (reboot, OOM,
 * crash) and the WebUI would otherwise just show "Daemon nicht erreichbar" forever.
 */
function maveoconnect_daemon_request(string $method, string $path, ?array $jsonBody = null, bool $autoRestartOnRefused = true): array
{
    $r = maveoconnect_daemon_request_raw($method, $path, $jsonBody);
    if (!$autoRestartOnRefused) {
        return $r;
    }
    if (!empty($r['ok'])) {
        return $r;
    }
    $err = strtolower((string) ($r['error'] ?? ''));
    $isRefused = (
        strpos($err, 'connection refused') !== false
        || strpos($err, 'failed to connect') !== false
        || strpos($err, 'couldn\'t connect') !== false
        || strpos($err, 'connect() timed out') !== false
        || (int) ($r['_http'] ?? 0) === 0 && $err !== ''
    );
    if (!$isRefused) {
        return $r;
    }
    // Try one rescue restart.
    $rs = maveoconnect_daemon_restart();
    if (!$rs['ok']) {
        $r['restartAttempted'] = true;
        $r['restartOutput'] = $rs['output'];
        return $r;
    }
    // Wait briefly for the listener to come up — Node typically binds within ~250ms.
    usleep(800000);
    $r2 = maveoconnect_daemon_request_raw($method, $path, $jsonBody);
    $r2['restartAttempted'] = true;
    $r2['restartOk'] = true;
    return $r2;
}

function maveoconnect_daemon_request_raw(string $method, string $path, ?array $jsonBody = null, int $timeoutSec = 30): array
{
    $settings = maveoconnect_load_settings_array();
    $port = maveoconnect_daemon_port($settings);
    $token = maveoconnect_api_token();
    if ($token === null) {
        global $MAVOECONNECT_CONFIG_DIR;
        if ($MAVOECONNECT_CONFIG_DIR !== '' && is_dir($MAVOECONNECT_CONFIG_DIR)) {
            maveoconnect_ensure_api_token();
            $token = maveoconnect_api_token();
        }
    }
    if ($token === null) {
        return ['ok' => false, 'error' => 'API token missing. Save settings once to create it, then start the daemon.', 'http' => 0, '_http' => 0];
    }

    $url = 'http://127.0.0.1:' . $port . $path;
    $ch = curl_init($url);
    if ($ch === false) {
        return ['ok' => false, 'error' => 'curl_init failed', 'http' => 0, '_http' => 0];
    }

    $headers = [
        'X-Maveo-Token: ' . $token,
        'Accept: application/json',
    ];
    $payload = null;
    if ($jsonBody !== null) {
        $payload = json_encode($jsonBody);
        if ($payload === false) {
            curl_close($ch);
            return ['ok' => false, 'error' => 'json_encode failed', 'http' => 0, '_http' => 0];
        }
        $headers[] = 'Content-Type: application/json';
    }

    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 2,
        CURLOPT_TIMEOUT => $timeoutSec,
    ]);
    if ($jsonBody !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    } elseif ($method === 'POST' || $method === 'PUT') {
        curl_setopt($ch, CURLOPT_POSTFIELDS, '{}');
    }

    $response = curl_exec($ch);
    $http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $cerr = curl_error($ch);
    curl_close($ch);

    if ($response === false) {
        return ['ok' => false, 'error' => $cerr ?: 'curl_exec failed', 'http' => $http, '_http' => $http];
    }

    $decoded = json_decode($response, true);
    if (!is_array($decoded)) {
        return ['ok' => false, 'error' => 'Invalid JSON from daemon', 'http' => $http, '_http' => $http, 'raw' => $response];
    }

    $decoded['_http'] = $http;
    $decoded['ok'] = $http >= 200 && $http < 300;
    return $decoded;
}

/**
 * Block until the Node daemon publishes a changed door/MQTT/error snapshot (long-poll)
 * or until $timeoutSec. Used by status.php for near-real-time UI without WebSockets.
 *
 * @param int $sinceRev Last `_streamRev` the browser saw (0 on first load).
 */
function maveoconnect_daemon_status_wait(int $sinceRev, int $timeoutSec = 36): array
{
    $timeoutSec = max(12, min(90, $timeoutSec));
    $waitMs = max(5000, ($timeoutSec - 5) * 1000);
    $path = '/api/status/wait?rev=' . $sinceRev . '&timeoutMs=' . $waitMs;
    return maveoconnect_daemon_request_raw('GET', $path, null, $timeoutSec);
}
