<?php
require_once __DIR__ . '/loxberry_bootstrap.php';
require_once __DIR__ . '/maveo_paths.php';

$msg = '';
$error = '';

function maveoconnect_ensure_config_dir(): bool
{
    global $MAVOECONNECT_CONFIG_DIR;
    if ($MAVOECONNECT_CONFIG_DIR === '') {
        return false;
    }
    if (!is_dir($MAVOECONNECT_CONFIG_DIR)) {
        return @mkdir($MAVOECONNECT_CONFIG_DIR, 0750, true);
    }
    return true;
}

function maveoconnect_ensure_api_token(): void
{
    global $MAVOECONNECT_API_TOKEN_FILE;
    if ($MAVOECONNECT_API_TOKEN_FILE === '') {
        return;
    }
    if (file_exists($MAVOECONNECT_API_TOKEN_FILE)) {
        return;
    }
    if (function_exists('random_bytes')) {
        $t = bin2hex(random_bytes(32));
    } else {
        $t = bin2hex(openssl_random_pseudo_bytes(32));
    }
    file_put_contents($MAVOECONNECT_API_TOKEN_FILE, $t);
    @chmod($MAVOECONNECT_API_TOKEN_FILE, 0600);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['save'])) {
    if (!maveoconnect_ensure_config_dir()) {
        $error = 'Could not create config directory.';
    } else {
        maveoconnect_ensure_api_token();
        $existing = maveoconnect_load_settings_array();
        $m = $existing['maveo'] ?? [];
        $adv = $existing['advanced'] ?? [];
        $daemon = $existing['daemon'] ?? [];
        $logging = $existing['logging'] ?? [];
        $mf = $existing['mqttForward'] ?? [];

        $m['email'] = trim((string) ($_POST['maveo_email'] ?? ''));
        $pw = trim((string) ($_POST['maveo_password'] ?? ''));
        if ($pw !== '') {
            $m['password'] = $pw;
        } elseif (!isset($m['password'])) {
            $m['password'] = '';
        }
        $m['cognitoIdentityPoolId'] = trim((string) ($_POST['maveo_cognito_identity_pool_id'] ?? ''));
        $m['cognitoClientId'] = trim((string) ($_POST['maveo_cognito_client_id'] ?? ''));
        $m['region'] = trim((string) ($_POST['maveo_region'] ?? 'us-west-2'));
        $m['useTestEndpoints'] = isset($_POST['maveo_use_test_endpoints']);
        $m['thingName'] = trim((string) ($_POST['maveo_thing_name'] ?? ''));
        $m['iotHostname'] = trim((string) ($_POST['maveo_iot_hostname'] ?? ''));
        $m['mqttWssSigning'] = trim((string) ($_POST['maveo_mqtt_wss_signing'] ?? ''));

        $adv['blueFiRspPollMs'] = max(100, min(30000, (int) ($_POST['adv_bluefi_rsp_poll_ms'] ?? 400)));
        $adv['mqttSessionContention'] = isset($_POST['adv_mqtt_session_contention']);
        foreach (
            [
                'adv_mqtt_contention_burst_window_ms' => 'mqttContentionBurstWindowMs',
                'adv_mqtt_contention_burst_threshold' => 'mqttContentionBurstThreshold',
                'adv_mqtt_contention_backoff_ms' => 'mqttContentionBackoffMs',
                'adv_mqtt_reclaim_max_attempts' => 'mqttReclaimMaxAttempts',
                'adv_mqtt_reclaim_delay_ms' => 'mqttReclaimDelayMs',
            ] as $field => $key
        ) {
            $raw = trim((string) ($_POST[$field] ?? ''));
            $adv[$key] = $raw === '' ? null : (int) $raw;
        }

        $daemon['port'] = max(1024, min(65535, (int) ($_POST['daemon_port'] ?? 47832)));

        $logging['level'] = in_array($_POST['logging_level'] ?? '', ['error', 'warn', 'info', 'debug'], true)
            ? $_POST['logging_level']
            : 'info';

        $mf['enabled'] = isset($_POST['mqtt_forward_enabled']);
        $mf['brokerUrl'] = trim((string) ($_POST['mqtt_forward_broker_url'] ?? 'mqtt://127.0.0.1:1883'));
        $mf['username'] = trim((string) ($_POST['mqtt_forward_username'] ?? ''));
        $mfpw = trim((string) ($_POST['mqtt_forward_password'] ?? ''));
        if ($mfpw !== '') {
            $mf['password'] = $mfpw;
        } elseif (!isset($mf['password'])) {
            $mf['password'] = '';
        }
        $mf['topicPrefix'] = trim((string) ($_POST['mqtt_forward_topic_prefix'] ?? 'maveo'));

        $out = [
            'maveo' => $m,
            'advanced' => $adv,
            'daemon' => $daemon,
            'logging' => $logging,
            'mqttForward' => $mf,
        ];

        $json = json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            $error = 'JSON encode failed.';
        } elseif (file_put_contents($MAVOECONNECT_SETTINGS, $json) === false) {
            $error = 'Could not write settings.json';
        } else {
            @chmod($MAVOECONNECT_SETTINGS, 0600);
            $msg = 'Settings saved. Restart the Maveo Connect daemon to apply credential and port changes.';
        }
    }
}

$s = maveoconnect_load_settings_array();
$m = $s['maveo'] ?? [];
$adv = $s['advanced'] ?? [];
$daemon = $s['daemon'] ?? [];
$logging = $s['logging'] ?? [];
$mf = $s['mqttForward'] ?? [];

LBWeb::lbheader('Maveo Connect — Settings', '<style>.maveo-grid{display:grid;grid-template-columns:220px 1fr;gap:8px;max-width:900px;} .maveo-grid label{font-weight:bold;} fieldset{margin:1em 0;}</style>', '');

if ($msg !== '') {
    echo '<p class="ui-state-highlight ui-corner-all" style="padding:8px;">' . htmlspecialchars($msg) . '</p>';
}
if ($error !== '') {
    echo '<p class="ui-state-error ui-corner-all" style="padding:8px;">' . htmlspecialchars($error) . '</p>';
}

echo '<p><a href="index.php">Index</a> · <a href="status.php">Status</a></p>';

echo '<form method="post">';
echo '<fieldset><legend>Maveo account &amp; stick</legend><div class="maveo-grid">';
echo '<label for="maveo_email">Email</label><input type="email" id="maveo_email" name="maveo_email" value="' . htmlspecialchars($m['email'] ?? '') . '" autocomplete="username" />';
echo '<label for="maveo_password">Password</label><input type="password" id="maveo_password" name="maveo_password" value="" placeholder="Leave blank to keep current" autocomplete="current-password" />';
echo '<label for="maveo_cognito_identity_pool_id">Cognito identity pool ID</label><input type="text" id="maveo_cognito_identity_pool_id" name="maveo_cognito_identity_pool_id" value="' . htmlspecialchars($m['cognitoIdentityPoolId'] ?? '') . '" />';
echo '<label for="maveo_cognito_client_id">Cognito app client ID (optional)</label><input type="text" id="maveo_cognito_client_id" name="maveo_cognito_client_id" value="' . htmlspecialchars($m['cognitoClientId'] ?? '') . '" />';
echo '<label for="maveo_region">AWS region</label><input type="text" id="maveo_region" name="maveo_region" value="' . htmlspecialchars($m['region'] ?? 'us-west-2') . '" />';
echo '<label for="maveo_use_test_endpoints">Use test IoT endpoints</label><span><input type="checkbox" id="maveo_use_test_endpoints" name="maveo_use_test_endpoints" value="1"' . (!empty($m['useTestEndpoints']) ? ' checked' : '') . ' /></span>';
echo '<label for="maveo_thing_name">Connect Stick serial (thing name)</label><input type="text" id="maveo_thing_name" name="maveo_thing_name" value="' . htmlspecialchars($m['thingName'] ?? '') . '" />';
echo '<label for="maveo_iot_hostname">IoT hostname override (optional)</label><input type="text" id="maveo_iot_hostname" name="maveo_iot_hostname" value="' . htmlspecialchars($m['iotHostname'] ?? '') . '" />';
echo '<label for="maveo_mqtt_wss_signing">MQTT WSS signing (optional, e.g. query)</label><input type="text" id="maveo_mqtt_wss_signing" name="maveo_mqtt_wss_signing" value="' . htmlspecialchars($m['mqttWssSigning'] ?? '') . '" />';
echo '</div></fieldset>';

echo '<fieldset><legend>Daemon &amp; logging</legend><div class="maveo-grid">';
echo '<label for="daemon_port">Local API port (localhost only)</label><input type="number" id="daemon_port" name="daemon_port" min="1024" max="65535" value="' . (int) ($daemon['port'] ?? 47832) . '" />';
echo '<label for="logging_level">Log level (daemon log file)</label><select id="logging_level" name="logging_level">';
foreach (['error', 'warn', 'info', 'debug'] as $lvl) {
    $sel = ($logging['level'] ?? 'info') === $lvl ? ' selected' : '';
    echo '<option value="' . $lvl . '"' . $sel . '>' . $lvl . '</option>';
}
echo '</select>';
echo '</div></fieldset>';

echo '<fieldset><legend>MQTT forward (Loxone / local broker)</legend><div class="maveo-grid">';
echo '<label for="mqtt_forward_enabled">Enable forward</label><span><input type="checkbox" id="mqtt_forward_enabled" name="mqtt_forward_enabled" value="1"' . (!empty($mf['enabled']) ? ' checked' : '') . ' /></span>';
echo '<label for="mqtt_forward_broker_url">Broker URL</label><input type="text" id="mqtt_forward_broker_url" name="mqtt_forward_broker_url" value="' . htmlspecialchars($mf['brokerUrl'] ?? 'mqtt://127.0.0.1:1883') . '" />';
echo '<label for="mqtt_forward_username">Username</label><input type="text" id="mqtt_forward_username" name="mqtt_forward_username" value="' . htmlspecialchars($mf['username'] ?? '') . '" autocomplete="off" />';
echo '<label for="mqtt_forward_password">Password</label><input type="password" id="mqtt_forward_password" name="mqtt_forward_password" value="" placeholder="Leave blank to keep" autocomplete="new-password" />';
echo '<label for="mqtt_forward_topic_prefix">Topic prefix</label><input type="text" id="mqtt_forward_topic_prefix" name="mqtt_forward_topic_prefix" value="' . htmlspecialchars($mf['topicPrefix'] ?? 'maveo') . '" />';
echo '</div><p class="ui-helper">Publishes <code>{prefix}/door_position</code>, <code>door_label</code>, <code>light_on</code> (non-retained).</p></fieldset>';

echo '<fieldset><legend>Advanced — MQTT reclaim &amp; BlueFi</legend><div class="maveo-grid">';
echo '<label for="adv_bluefi_rsp_poll_ms">BlueFi poll interval (ms)</label><input type="number" id="adv_bluefi_rsp_poll_ms" name="adv_bluefi_rsp_poll_ms" min="100" max="30000" value="' . (int) ($adv['blueFiRspPollMs'] ?? 400) . '" />';
echo '<label for="adv_mqtt_session_contention">Session contention handling</label><span><input type="checkbox" id="adv_mqtt_session_contention" name="adv_mqtt_session_contention" value="1"' . (($adv['mqttSessionContention'] ?? true) ? ' checked' : '') . ' /></span>';
echo '<label for="adv_mqtt_contention_burst_window_ms">Contention burst window (ms)</label><input type="number" id="adv_mqtt_contention_burst_window_ms" name="adv_mqtt_contention_burst_window_ms" value="' . htmlspecialchars((string) ($adv['mqttContentionBurstWindowMs'] ?? '')) . '" placeholder="default" />';
echo '<label for="adv_mqtt_contention_burst_threshold">Burst threshold</label><input type="number" id="adv_mqtt_contention_burst_threshold" name="adv_mqtt_contention_burst_threshold" value="' . htmlspecialchars((string) ($adv['mqttContentionBurstThreshold'] ?? '')) . '" placeholder="default" />';
echo '<label for="adv_mqtt_contention_backoff_ms">Backoff after burst (ms)</label><input type="number" id="adv_mqtt_contention_backoff_ms" name="adv_mqtt_contention_backoff_ms" value="' . htmlspecialchars((string) ($adv['mqttContentionBackoffMs'] ?? '')) . '" placeholder="default" />';
echo '<label for="adv_mqtt_reclaim_max_attempts">Reclaim max attempts</label><input type="number" id="adv_mqtt_reclaim_max_attempts" name="adv_mqtt_reclaim_max_attempts" value="' . htmlspecialchars((string) ($adv['mqttReclaimMaxAttempts'] ?? '')) . '" placeholder="default" />';
echo '<label for="adv_mqtt_reclaim_delay_ms">Reclaim delay (ms)</label><input type="number" id="adv_mqtt_reclaim_delay_ms" name="adv_mqtt_reclaim_delay_ms" value="' . htmlspecialchars((string) ($adv['mqttReclaimDelayMs'] ?? '')) . '" placeholder="default" />';
echo '</div></fieldset>';

echo '<p><button type="submit" name="save" value="1">Save</button></p>';
echo '</form>';

echo '<p class="ui-helper">See <code>maveo-connect-stick-client/.env.example</code> in the plugin tree for field meanings.</p>';

LBWeb::lbfooter();
