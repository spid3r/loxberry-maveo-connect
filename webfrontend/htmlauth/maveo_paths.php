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

/**
 * @param array<string,mixed>|null $jsonBody Object to JSON-encode, or null for empty JSON object on POST/PUT.
 */
function maveoconnect_daemon_request(string $method, string $path, ?array $jsonBody = null): array
{
    $settings = maveoconnect_load_settings_array();
    $port = maveoconnect_daemon_port($settings);
    $token = maveoconnect_api_token();
    if ($token === null) {
        return ['ok' => false, 'error' => 'API token missing. Save settings once to create it, then start the daemon.', 'http' => 0];
    }

    $url = 'http://127.0.0.1:' . $port . $path;
    $ch = curl_init($url);
    if ($ch === false) {
        return ['ok' => false, 'error' => 'curl_init failed', 'http' => 0];
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
            return ['ok' => false, 'error' => 'json_encode failed', 'http' => 0];
        }
        $headers[] = 'Content-Type: application/json';
    }

    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 2,
        CURLOPT_TIMEOUT => 30,
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
        return ['ok' => false, 'error' => $cerr ?: 'curl_exec failed', 'http' => $http];
    }

    $decoded = json_decode($response, true);
    if (!is_array($decoded)) {
        return ['ok' => false, 'error' => 'Invalid JSON from daemon', 'http' => $http, 'raw' => $response];
    }

    $decoded['_http'] = $http;
    $decoded['ok'] = $http >= 200 && $http < 300;
    return $decoded;
}
