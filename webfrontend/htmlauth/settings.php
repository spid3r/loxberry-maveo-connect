<?php
require_once __DIR__ . '/loxberry_bootstrap.php';
require_once __DIR__ . '/maveo_paths.php';
require_once __DIR__ . '/maveo_ui.php';

/** @return array<string,mixed> */
function maveoconnect_probe_payload_from_request(): array
{
    $out = ['maxThings' => 120];
    $raw = file_get_contents('php://input');
    $in = json_decode($raw ?: '{}', true);
    if (!is_array($in)) {
        return $out;
    }
    if (!empty($in['email']) && is_string($in['email'])) {
        $out['email'] = $in['email'];
    }
    if (array_key_exists('password', $in) && is_string($in['password'])) {
        $out['password'] = $in['password'];
    }
    $mx = isset($in['maxThings']) ? (int) $in['maxThings'] : 0;
    if ($mx >= 1 && $mx <= 250) {
        $out['maxThings'] = $mx;
    }
    foreach (['cognitoIdentityPoolId', 'cognitoClientId', 'region', 'iotHostname', 'mqttWssSigning'] as $k) {
        if (!empty($in[$k]) && is_string($in[$k])) {
            $out[$k] = $in[$k];
        }
    }
    if (array_key_exists('useTestEndpoints', $in)) {
        $v = $in['useTestEndpoints'];
        $out['useTestEndpoints'] = $v === true || $v === 1 || $v === '1' || $v === 'true';
    }

    return $out;
}

if (!empty($_GET['ajax_probe']) && strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? '')) === 'POST') {
    header('Content-Type: application/json; charset=utf-8');
    $r = maveoconnect_daemon_request('POST', '/api/maveo/probe', maveoconnect_probe_payload_from_request());
    echo json_encode($r);
    exit;
}

if (!empty($_GET['ajax_things'])) {
    header('Content-Type: application/json; charset=utf-8');
    $r = maveoconnect_daemon_request('POST', '/api/maveo/probe', ['maxThings' => 120]);
    echo json_encode($r);
    exit;
}

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

/** @return array{0:string,1:int} host, port */
function maveoconnect_parse_mqtt_url(string $url): array
{
    $host = '127.0.0.1';
    $port = 1883;
    if (preg_match('#^mqtts?://([^:/]+)(?::(\d+))?#i', $url, $m)) {
        $host = $m[1];
        if (!empty($m[2])) {
            $port = max(1, min(65535, (int) $m[2]));
        }
    }

    return [$host, $port];
}

function maveoconnect_is_loxberry_local_broker(array $mf): bool
{
    $u = strtolower(trim((string) ($mf['brokerUrl'] ?? '')));

    return (bool) preg_match('#^mqtt://127\.0\.0\.1:1883/?$#', $u)
        || (bool) preg_match('#^mqtt://localhost:1883/?$#', $u);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['save'])) {
    if (!maveoconnect_ensure_config_dir()) {
        $error = mc_t('SETTINGS', 'ERROR_CONFIG_DIR');
    } else {
        maveoconnect_ensure_api_token();
        $existing = maveoconnect_load_settings_array();
        $m = $existing['maveo'] ?? [];
        $adv = $existing['advanced'] ?? [];
        $daemon = $existing['daemon'] ?? [];
        $logging = $existing['logging'] ?? [];
        $mf = $existing['mqttForward'] ?? [];
        $general = $existing['general'] ?? [];
        $loxApi = $existing['loxoneApi'] ?? [];

        $m['email'] = trim((string) ($_POST['maveo_email'] ?? ''));
        $pw = trim((string) ($_POST['maveo_password'] ?? ''));
        if ($pw !== '') {
            $m['password'] = $pw;
        } elseif (!isset($m['password'])) {
            $m['password'] = '';
        }
        $m['thingName'] = trim((string) ($_POST['maveo_thing_name'] ?? ''));
        $m['cognitoIdentityPoolId'] = trim((string) ($_POST['maveo_cognito_identity_pool_id'] ?? ''));
        $m['cognitoClientId'] = trim((string) ($_POST['maveo_cognito_client_id'] ?? ''));
        $m['region'] = trim((string) ($_POST['maveo_region'] ?? MAVOECONNECT_LIB_DEFAULT_REGION));
        $m['useTestEndpoints'] = isset($_POST['maveo_use_test_endpoints']);
        $m['iotHostname'] = trim((string) ($_POST['maveo_iot_hostname'] ?? ''));
        $m['mqttWssSigning'] = trim((string) ($_POST['maveo_mqtt_wss_signing'] ?? ''));

        $daemon['port'] = max(1024, min(65535, (int) ($_POST['daemon_port'] ?? 47832)));

        $logging['level'] = in_array($_POST['logging_level'] ?? '', ['error', 'warn', 'info', 'debug'], true)
            ? $_POST['logging_level']
            : 'info';

        $mf['enabled'] = isset($_POST['mqtt_forward_enabled']);
        if (isset($_POST['mqtt_use_lb_broker'])) {
            $mf['brokerUrl'] = 'mqtt://127.0.0.1:1883';
        } else {
            $bh = trim((string) ($_POST['mqtt_forward_host'] ?? '127.0.0.1'));
            if ($bh === '') {
                $bh = '127.0.0.1';
            }
            $bp = max(1, min(65535, (int) ($_POST['mqtt_forward_port'] ?? 1883)));
            $mf['brokerUrl'] = 'mqtt://' . $bh . ':' . $bp;
        }
        $mf['username'] = trim((string) ($_POST['mqtt_forward_username'] ?? ''));
        $mfpw = trim((string) ($_POST['mqtt_forward_password'] ?? ''));
        if ($mfpw !== '') {
            $mf['password'] = $mfpw;
        } elseif (!isset($mf['password'])) {
            $mf['password'] = '';
        }
        $mf['topicPrefix'] = trim((string) ($_POST['mqtt_forward_topic_prefix'] ?? 'maveo'));

        $loxApi['enabled'] = isset($_POST['loxone_api_enabled']);

        $langCandidate = strtolower(trim((string) ($_POST['general_language'] ?? '')));
        if (in_array($langCandidate, ['de', 'en'], true)) {
            $general['language'] = $langCandidate;
        }

        $out = [
            'general' => $general,
            'maveo' => $m,
            'advanced' => $adv,
            'daemon' => $daemon,
            'logging' => $logging,
            'mqttForward' => $mf,
            'loxoneApi' => $loxApi,
        ];

        $json = json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            $error = mc_t('SETTINGS', 'ERROR_JSON');
        } elseif (file_put_contents($MAVOECONNECT_SETTINGS, $json) === false) {
            $error = mc_t('SETTINGS', 'ERROR_WRITE');
        } else {
            @chmod($MAVOECONNECT_SETTINGS, 0640);
            // Hot-reload first (cheap, no Node restart). Daemon-side auto-restart kicks
            // in if the call hits a dead listener — see maveoconnect_daemon_request().
            // null body → maveoconnect_daemon_request emits empty `{}` for POST automatically;
            // passing `new stdClass()` here breaks the `?array` signature (PHP TypeError → HTTP 500).
            $reload = maveoconnect_daemon_request('POST', '/api/reload', null, true);
            if (!empty($reload['ok'])) {
                $msg = mc_t('SETTINGS', 'SAVED_OK');
            } else {
                $rs = maveoconnect_daemon_restart();
                $msg = $rs['ok']
                    ? mc_t('SETTINGS', 'SAVED_RESTART_OK')
                    : mc_t('SETTINGS', 'SAVED_RESTART_FAIL');
            }
        }
    }
}

$s = maveoconnect_load_settings_array();
$m = $s['maveo'] ?? [];
$adv = $s['advanced'] ?? [];
$daemon = $s['daemon'] ?? [];
$logging = $s['logging'] ?? [];
$mf = $s['mqttForward'] ?? [];
$general = $s['general'] ?? [];
$loxApi = $s['loxoneApi'] ?? [];

$poolDisplay = trim((string) ($m['cognitoIdentityPoolId'] ?? ''));
$poolPlaceholder = sprintf('%s (%s)', mc_t('SETTINGS', 'HINT_POOL_ID'), MAVOECONNECT_LIB_DEFAULT_POOL);

[$mqttHost, $mqttPort] = maveoconnect_parse_mqtt_url((string) ($mf['brokerUrl'] ?? ''));
$mqttUseLb = maveoconnect_is_loxberry_local_broker($mf);

$settingsExtraCss = '<style>
.mc-settings-intro{color:#37474f;font-size:.95rem;line-height:1.55;margin:0 0 18px;max-width:54rem;}
.mc-step-hint{font-size:.86rem;color:#607d8b;margin:-6px 0 14px;line-height:1.45;max-width:42rem;}
.mc-probe-banner{display:none;margin:14px 0 0;padding:12px 14px;border-radius:9px;font-size:.87rem;line-height:1.45;}
.mc-probe-banner.mc-show{display:block;}
.mc-probe-banner.mc-ok{background:#fff9e6;border:1px solid rgba(248,191,0,.5);color:#3e2723;}
.mc-probe-banner.mc-err{background:#ffebee;border:1px solid #ef9a9a;color:#b71c1c;}
.mc-probe-actions{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0 4px;align-items:center;}
.mc-btn-maveo{background:#F8BF00!important;color:#1a1a1a!important;border:1px solid rgba(0,0,0,.1)!important;padding:11px 18px;border-radius:8px;font-weight:600;cursor:pointer;font-size:.92rem;}
.mc-btn-maveo:hover{background:#e0ac00!important;}
.mc-btn-maveo:disabled{opacity:.55;cursor:not-allowed;}
.mc-btn-maveo-secondary{background:#eceff1;color:#263238!important;border:1px solid #cfd8dc;padding:11px 18px;border-radius:8px;font-weight:600;cursor:pointer;font-size:.92rem;}
.mc-btn-maveo-secondary:hover{background:#dde3e6;}
.mc-btn-maveo-secondary:disabled{opacity:.55;cursor:not-allowed;}
.mc-thing-chips{list-style:none;margin:12px 0 0;padding:0;display:none;flex-wrap:wrap;gap:8px;}
.mc-thing-chips.mc-show{display:flex;}
.mc-thing-chips li{margin:0;padding:6px 12px;border-radius:999px;background:rgba(248,191,0,.12);border:1px solid rgba(248,191,0,.35);font-size:.8rem;color:#37474f;}
.mc-card-form{background:#fff;border:1px solid #e8e8e8;border-radius:12px;padding:20px 22px;margin:0 0 16px;box-shadow:0 2px 10px rgba(0,0,0,.05);}
.mc-card-form>h2{margin:0 0 16px;font-size:1.1rem;font-weight:600;color:var(--mc-primary-ink);padding-bottom:10px;border-bottom:2px solid rgba(248,191,0,.2);}
.mc-form-stack{display:flex;flex-direction:column;gap:16px;max-width:34rem;}
.mc-field label{display:block;font-weight:600;font-size:.85rem;color:#37474f;margin-bottom:8px;}
.mc-field .mc-hint{display:block;font-weight:400;font-size:.78rem;color:#607d8b;margin-top:6px;line-height:1.4;}
.mc-field input[type=text],.mc-field input[type=email],.mc-field input[type=password],.mc-field input[type=number],.mc-field select{
 width:100%;max-width:34rem;padding:11px 14px;border:1px solid #cfd8dc;border-radius:8px;font-size:.95rem;background:#fff;
}
.mc-field input:focus,.mc-field select:focus{outline:none;border-color:#F8BF00;box-shadow:0 0 0 3px rgba(248,191,0,.22);}
.mc-inline-2{display:grid;grid-template-columns:1.8fr 1fr;gap:14px;max-width:34rem;}
@media(max-width:520px){.mc-inline-2{grid-template-columns:1fr;}}
.mc-tile{border:1px solid #eceff1;border-radius:10px;padding:14px 16px;background:#fafcfd;}
.mc-tile+.mc-tile{margin-top:10px;}
.mc-tile-head{font-weight:600;font-size:.9rem;color:#263238;margin-bottom:6px;display:flex;align-items:center;gap:10px;}
.mc-tile-desc{font-size:.84rem;color:#546e7a;line-height:1.45;margin:0;}
.mc-save{padding:14px 0;}
.mc-save button[type=submit]{background:#F8BF00;color:#1a1a1a!important;border:1px solid rgba(0,0,0,.08);padding:13px 32px;border-radius:10px;font-size:1rem;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(248,191,0,.35);}
.mc-save button[type=submit]:hover{background:#e0ac00;}
.mc-expert{border:1px solid #e0e0e0;border-radius:12px;margin:14px 0 0;background:#fafafa;}
.mc-expert summary{cursor:pointer;padding:14px 18px;font-weight:600;color:#455a64;list-style:none;display:flex;align-items:center;gap:10px;}
.mc-expert summary::-webkit-details-marker{display:none;}
.mc-expert summary::before{content:"⚙";color:#90a4ae;font-size:1.05rem;}
.mc-expert[open] summary{background:#fff;border-bottom:1px solid #eeeeee;border-radius:12px 12px 0 0;}
.mc-expert-inner{padding:18px 20px;background:#fff;border-radius:0 0 12px 12px;}
.mc-section-title{font-size:.95rem;font-weight:700;color:var(--mc-primary-ink);margin:22px 0 12px;}
.mc-section-title:first-child{margin-top:0;}
.mc-row{display:grid;grid-template-columns:minmax(140px,220px) 1fr;gap:12px 20px;align-items:start;padding:14px 0;border-bottom:1px solid #f0f0f0;}
.mc-row:last-child{border-bottom:none;}
@media(max-width:640px){.mc-row{grid-template-columns:1fr;}}
.mc-row .mc-row-label{font-size:.82rem;font-weight:600;color:#455a64;padding-top:2px;line-height:1.35;}
.mc-row .mc-row-h{font-size:.75rem;color:#78909c;font-weight:400;display:block;margin-top:6px;line-height:1.35;}
.mc-row .mc-row-control{padding-top:0;}
.mc-switch{display:flex;align-items:center;gap:12px;margin:0;}
.mc-switch input[type=checkbox]{width:22px;height:22px;flex-shrink:0;}
.mc-switch span{font-size:.87rem;line-height:1.35;color:#37474f;}
</style>';

maveoconnect_lb_page_start('settings', $settingsExtraCss);

echo '<div class="mc-plugin-container">';
echo maveoconnect_plugin_header_bar();
if ($msg !== '') {
    echo '<p class="mc-flash-banner mc-flash-ok ui-state-highlight mc-flash-muted ui-corner-all" style="padding:11px;margin:0 0 12px;border-radius:9px;">'
        . htmlspecialchars($msg) . '</p>';
}
if ($error !== '') {
    echo '<p class="mc-flash-banner mc-flash-err ui-state-error ui-corner-all" style="padding:11px;margin:0 0 12px;border-radius:9px;">'
        . htmlspecialchars($error) . '</p>';
}

echo '<p class="mc-settings-intro">';
mc_th('SETTINGS', 'LEAD');
echo '</p>';

echo '<form method="post" id="mc_settings_form">';

echo '<div class="mc-card-form"><h2>';
mc_te('SETTINGS', 'SECTION1_TITLE');
echo '</h2>';
echo '<p class="mc-step-hint">';
mc_th('SETTINGS', 'SECTION1_HINT');
echo '</p>';
echo '<div class="mc-form-stack">';
echo '<div class="mc-field"><label for="maveo_email">';
mc_te('SETTINGS', 'LABEL_EMAIL');
echo '</label>';
echo '<input type="email" id="maveo_email" name="maveo_email" value="' . htmlspecialchars($m['email'] ?? '') . '" autocomplete="username" /></div>';
echo '<div class="mc-field"><label for="maveo_password">';
mc_te('SETTINGS', 'LABEL_PASSWORD');
echo '</label>';
echo '<input type="password" id="maveo_password" name="maveo_password" value="" autocomplete="current-password" />';
echo '<span class="mc-hint">';
mc_te('SETTINGS', 'HINT_PASSWORD');
echo '</span></div>';
echo '</div>';
echo '<div id="mc_maveo_probe_banner" class="mc-probe-banner" role="status" aria-live="polite"></div>';
echo '<div class="mc-probe-actions">';
echo '<button type="button" class="mc-btn-maveo" id="mc_probe_login">';
mc_te('SETTINGS', 'BTN_PROBE');
echo '</button>';
echo '<button type="button" class="mc-btn-maveo-secondary" id="mc_refresh_things">';
mc_te('SETTINGS', 'BTN_REFRESH_THINGS');
echo '</button>';
echo '</div>';
echo '</div>';

echo '<div class="mc-card-form"><h2>';
mc_te('SETTINGS', 'SECTION2_TITLE');
echo '</h2>';
echo '<p class="mc-step-hint">';
mc_th('SETTINGS', 'SECTION2_HINT');
echo '</p>';
echo '<p class="mc-field" style="margin:0;"><label>';
mc_te('SETTINGS', 'LABEL_ALL_THINGS');
echo '</label></p>';
echo '<ul id="mc_things_all" class="mc-thing-chips" aria-label="things"></ul>';
echo '<div class="mc-field"><label for="maveo_thing_pick">';
mc_te('SETTINGS', 'LABEL_THING_PICK');
echo '</label>';
echo '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:stretch;max-width:36rem;"><select id="maveo_thing_pick" style="flex:1;min-width:200px;padding:11px;border:1px solid #cfd8dc;border-radius:8px;font-size:.95rem;">';
echo '<option value="">' . htmlspecialchars(mc_t('SETTINGS', 'PICK_PLACEHOLDER'), ENT_QUOTES, 'UTF-8') . '</option></select>';
echo '</div>';
echo '<span class="mc-hint" id="mc_discover_msg"></span></div>';
echo '<div class="mc-field"><label for="maveo_thing_name">';
mc_te('SETTINGS', 'LABEL_THING_NAME');
echo '</label>';
echo '<input type="text" id="maveo_thing_name" name="maveo_thing_name" value="' . htmlspecialchars($m['thingName'] ?? '') . '" autocomplete="off" />';
echo '<span class="mc-hint">';
mc_te('SETTINGS', 'HINT_THING_NAME');
echo '</span></div>';
echo '</div>';

/**
 * "MQTT & Loxone integration" panel — promoted out of the expert area in v1.x
 * because the very first thing most users want from a LoxBerry plugin is
 * Loxone wiring. Three building blocks:
 *   1) MQTT forward (status OUT to a broker — push-style values for Loxone).
 *   2) Loxone control API (HTTP IN from Loxone Virtual Outputs — opt-in).
 *   3) URL examples + door-position code table (0..6) so a user can build the
 *      Virtual Output / status block without bouncing back to the README.
 */
echo '<div class="mc-panel" style="margin-top:14px;margin-bottom:6px;">';
echo '<h2 class="mc-step-hint" style="margin-top:0;">';
mc_te('SETTINGS', 'LOXONE_HELP_TITLE');
echo '</h2>';
echo '<p class="mc-muted" style="margin:0 0 10px;line-height:1.45;">';
mc_te('SETTINGS', 'LOXONE_HELP_INTRO');
echo '</p>';

// --- MQTT forward (status out) ---
echo '<p class="mc-section-title" style="margin-top:6px;">' . htmlspecialchars(mc_t('SETTINGS', 'LOXMQTT_TITLE', 'MQTT forward (status to Loxone)'), ENT_QUOTES, 'UTF-8') . '</p>';
echo '<div class="mc-tile"><div class="mc-tile-head"><label class="mc-switch"><input type="checkbox" id="mqtt_forward_enabled" name="mqtt_forward_enabled" value="1"' . (!empty($mf['enabled']) ? ' checked' : '') . ' /><span>' . htmlspecialchars(mc_t('SETTINGS', 'LABEL_MQTT_FORWARD'), ENT_QUOTES, 'UTF-8') . '</span></label></div>';
echo '<p class="mc-tile-desc">' . htmlspecialchars(mc_t('SETTINGS', 'HINT_MQTT_FORWARD'), ENT_QUOTES, 'UTF-8') . '</p></div>';
echo '<div class="mc-tile">';
echo '<div class="mc-tile-head"><label class="mc-switch"><input type="checkbox" id="mqtt_use_lb_broker" name="mqtt_use_lb_broker" value="1"' . ($mqttUseLb ? ' checked' : '') . ' /><span>' . htmlspecialchars(mc_t('SETTINGS', 'LABEL_USE_LB_BROKER'), ENT_QUOTES, 'UTF-8') . '</span></label></div>';
echo '<p class="mc-tile-desc">' . htmlspecialchars(mc_t('SETTINGS', 'HINT_USE_LB_BROKER'), ENT_QUOTES, 'UTF-8') . '</p></div>';
echo '<div id="mc-mqtt-custom" class="mc-inline-2 mc-form-stack" style="margin-top:12px;' . ($mqttUseLb ? 'display:none;' : '') . '">';
echo '<div class="mc-field"><label for="mqtt_forward_host">' . htmlspecialchars(mc_t('SETTINGS', 'LABEL_BROKER_HOST'), ENT_QUOTES, 'UTF-8') . '</label><input type="text" id="mqtt_forward_host" name="mqtt_forward_host" value="' . htmlspecialchars($mqttHost) . '" autocomplete="off" /></div>';
echo '<div class="mc-field"><label for="mqtt_forward_port">' . htmlspecialchars(mc_t('SETTINGS', 'LABEL_BROKER_PORT'), ENT_QUOTES, 'UTF-8') . '</label><input type="number" id="mqtt_forward_port" name="mqtt_forward_port" min="1" max="65535" value="' . (int) $mqttPort . '" /></div>';
echo '</div>';
echo '<div class="mc-field" style="max-width:34rem;"><label for="mqtt_forward_username">' . htmlspecialchars(mc_t('SETTINGS', 'LABEL_BROKER_USER'), ENT_QUOTES, 'UTF-8') . '</label><input type="text" id="mqtt_forward_username" name="mqtt_forward_username" value="' . htmlspecialchars($mf['username'] ?? '') . '" autocomplete="off" /></div>';
echo '<div class="mc-field" style="max-width:34rem;"><label for="mqtt_forward_password">' . htmlspecialchars(mc_t('SETTINGS', 'LABEL_BROKER_PASS'), ENT_QUOTES, 'UTF-8') . '</label><input type="password" id="mqtt_forward_password" name="mqtt_forward_password" value="" autocomplete="new-password" /><span class="mc-hint">' . htmlspecialchars(mc_t('SETTINGS', 'HINT_BROKER_PASS'), ENT_QUOTES, 'UTF-8') . '</span></div>';
echo '<div class="mc-field" style="max-width:34rem;"><label for="mqtt_forward_topic_prefix">' . htmlspecialchars(mc_t('SETTINGS', 'LABEL_TOPIC_PREFIX'), ENT_QUOTES, 'UTF-8') . '</label><input type="text" id="mqtt_forward_topic_prefix" name="mqtt_forward_topic_prefix" value="' . htmlspecialchars($mf['topicPrefix'] ?? 'maveo') . '" autocomplete="off" /><span class="mc-hint">';
mc_th('SETTINGS', 'HINT_TOPIC_PREFIX');
echo '</span></div>';

// --- Loxone control API (commands in) ---
echo '<p class="mc-section-title" style="margin-top:18px;">' . htmlspecialchars(mc_t('SETTINGS', 'LOXAPI_TITLE', 'Loxone control API (commands from Loxone)'), ENT_QUOTES, 'UTF-8') . '</p>';
echo '<div class="mc-tile"><div class="mc-tile-head"><label class="mc-switch"><input type="checkbox" id="loxone_api_enabled" name="loxone_api_enabled" value="1"' . (!empty($loxApi['enabled']) ? ' checked' : '') . ' /><span>' . htmlspecialchars(mc_t('SETTINGS', 'LOXAPI_TOGGLE_LABEL', 'Enable Loxone control API'), ENT_QUOTES, 'UTF-8') . '</span></label></div>';
echo '<p class="mc-tile-desc">' . htmlspecialchars(mc_t('SETTINGS', 'LOXAPI_HINT', 'Adds simple GET endpoints under /admin/plugins/maveoconnect/api/ that Loxone Virtual Outputs can call. Disabled by default; the daemon stays on 127.0.0.1 either way.'), ENT_QUOTES, 'UTF-8') . '</p></div>';

echo '<p class="mc-muted" style="margin:8px 0 6px;line-height:1.45;font-size:.88rem;">' . htmlspecialchars(mc_t('SETTINGS', 'LOXAPI_AUTH_NOTE', 'Authentication uses the standard LoxBerry plugin Basic Auth. Send the credentials inline in the URL configured in your Loxone Virtual Output, e.g. http://loxberry:loxberry@<LoxBerry-IP>/...'), ENT_QUOTES, 'UTF-8') . '</p>';

echo '<p class="mc-muted" style="margin:8px 0 4px;line-height:1.45;font-size:.88rem;font-weight:600;">' . htmlspecialchars(mc_t('SETTINGS', 'LOXAPI_URLS_TITLE', 'Example URLs (replace LB-IP with your LoxBerry):'), ENT_QUOTES, 'UTF-8') . '</p>';
echo '<ul class="mc-muted" style="margin:0 0 10px;padding-left:1.25rem;line-height:1.55;font-size:.85rem;">';
echo '<li><code>http://loxberry:loxberry@LB-IP/admin/plugins/maveoconnect/api/door.php?cmd=open</code> &mdash; ' . htmlspecialchars(mc_t('SETTINGS', 'LOXAPI_URL_DOOR', 'open / close / stop / ventilate'), ENT_QUOTES, 'UTF-8') . '</li>';
echo '<li><code>http://loxberry:loxberry@LB-IP/admin/plugins/maveoconnect/api/light.php?state=on</code> &mdash; ' . htmlspecialchars(mc_t('SETTINGS', 'LOXAPI_URL_LIGHT', 'on / off / toggle'), ENT_QUOTES, 'UTF-8') . '</li>';
echo '<li><code>http://loxberry:loxberry@LB-IP/admin/plugins/maveoconnect/api/reclaim.php</code> &mdash; ' . htmlspecialchars(mc_t('SETTINGS', 'LOXAPI_URL_RECLAIM', 'reclaim MQTT session from the Maveo app'), ENT_QUOTES, 'UTF-8') . '</li>';
echo '<li><code>http://loxberry:loxberry@LB-IP/admin/plugins/maveoconnect/api/status.php</code> &mdash; ' . htmlspecialchars(mc_t('SETTINGS', 'LOXAPI_URL_STATUS', 'compact JSON status (door / light / mqttConnected)'), ENT_QUOTES, 'UTF-8') . '</li>';
echo '</ul>';

// --- Door position codes (0..6) — useful for Loxone status block design ---
echo '<p class="mc-section-title" style="margin-top:14px;">' . htmlspecialchars(mc_t('SETTINGS', 'DOOR_CODES_TITLE', 'Door position codes (door_position / status.php)'), ENT_QUOTES, 'UTF-8') . '</p>';
echo '<table class="mc-muted" style="border-collapse:collapse;font-size:.85rem;line-height:1.4;margin:0 0 8px;">';
echo '<thead><tr>'
    . '<th style="text-align:left;padding:4px 12px 4px 0;">' . htmlspecialchars(mc_t('SETTINGS', 'DOOR_CODES_COL_CODE', 'Code'), ENT_QUOTES, 'UTF-8') . '</th>'
    . '<th style="text-align:left;padding:4px 12px 4px 0;">' . htmlspecialchars(mc_t('SETTINGS', 'DOOR_CODES_COL_LABEL', 'Label'), ENT_QUOTES, 'UTF-8') . '</th>'
    . '<th style="text-align:left;padding:4px 0;">' . htmlspecialchars(mc_t('SETTINGS', 'DOOR_CODES_COL_MEANING', 'Meaning'), ENT_QUOTES, 'UTF-8') . '</th>'
    . '</tr></thead><tbody>';
$doorRows = [
    ['0', 'stopped',           mc_t('SETTINGS', 'DOOR_CODE_0', 'Motor stopped between end positions')],
    ['1', 'opening',            mc_t('SETTINGS', 'DOOR_CODE_1', 'Door opening')],
    ['2', 'closing',            mc_t('SETTINGS', 'DOOR_CODE_2', 'Door closing')],
    ['3', 'open',               mc_t('SETTINGS', 'DOOR_CODE_3', 'Fully open')],
    ['4', 'closed',             mc_t('SETTINGS', 'DOOR_CODE_4', 'Fully closed')],
    ['5', 'intermediateOpen',   mc_t('SETTINGS', 'DOOR_CODE_5', 'Intermediate / ventilation position')],
    ['6', 'intermediateClosed', mc_t('SETTINGS', 'DOOR_CODE_6', 'Intermediate position toward closed')],
];
foreach ($doorRows as $row) {
    echo '<tr>'
        . '<td style="padding:3px 12px 3px 0;font-variant-numeric:tabular-nums;">' . htmlspecialchars($row[0]) . '</td>'
        . '<td style="padding:3px 12px 3px 0;"><code>' . htmlspecialchars($row[1]) . '</code></td>'
        . '<td style="padding:3px 0;">' . htmlspecialchars($row[2]) . '</td>'
        . '</tr>';
}
echo '</tbody></table>';
echo '<p class="mc-muted" style="margin:0 0 12px;line-height:1.45;font-size:.82rem;">' . htmlspecialchars(mc_t('SETTINGS', 'DOOR_CODES_LOXONE_HINT', 'In a Loxone status block: open = 3 or 5, closed = 4, moving = 1 or 2. light_on is 1/0.'), ENT_QUOTES, 'UTF-8') . '</p>';

echo '<p class="mc-muted" style="margin:0 0 10px;line-height:1.45;font-size:.88rem;">';
mc_te('SETTINGS', 'LOXONE_HELP_LATENCY');
echo '</p>';
echo '<p class="mc-muted" style="margin:0;line-height:1.45;font-size:.88rem;">';
mc_te('SETTINGS', 'LOXONE_HELP_MQTT_AUTH');
echo '</p>';
echo '</div>';

/** Everything below the dotted line is hidden behind the expert details element so a
 *  first-time user only sees: email, password, probe button, thing picker.  */
echo '<details class="mc-expert">';
echo '<summary>';
mc_te('SETTINGS', 'EXPERT_SUMMARY');
echo '</summary>';
echo '<div class="mc-expert-inner">';
echo '<p style="margin:0 0 14px;color:#546e7a;font-size:.86rem;line-height:1.5;">';
mc_te('SETTINGS', 'EXPERT_INTRO');
echo '</p>';

echo '<p class="mc-section-title">' . htmlspecialchars(mc_t('COMMON', 'LANGUAGE_LABEL'), ENT_QUOTES, 'UTF-8') . '</p>';
echo '<div class="mc-row"><div class="mc-row-label">' . htmlspecialchars(mc_t('COMMON', 'LANGUAGE_LABEL'), ENT_QUOTES, 'UTF-8') . '</div><div class="mc-row-control">';
echo '<select id="general_language" name="general_language">';
$langs = MaveoConnectI18N::availableLanguages();
$pinned = strtolower((string) ($general['language'] ?? ''));
echo '<option value=""' . ($pinned === '' ? ' selected' : '') . '>(auto)</option>';
foreach ($langs as $code) {
    $sel = $pinned === $code ? ' selected' : '';
    echo '<option value="' . htmlspecialchars($code) . '"' . $sel . '>' . htmlspecialchars(mc_t('COMMON', 'LANGUAGE_OPTION_' . $code, strtoupper($code))) . '</option>';
}
echo '</select></div></div>';

/** MQTT-forward controls were promoted out of the expert section; the
 *  consolidated "MQTT & Loxone" panel above now owns them. */

echo '<p class="mc-section-title">';
mc_te('SETTINGS', 'EXPERT_AUTH_TITLE');
echo '</p>';
echo '<div class="mc-row"><div class="mc-row-label">' . htmlspecialchars(mc_t('SETTINGS', 'LABEL_POOL_ID'), ENT_QUOTES, 'UTF-8') . '<span class="mc-row-h">' . htmlspecialchars(mc_t('SETTINGS', 'HINT_POOL_ID'), ENT_QUOTES, 'UTF-8') . '</span></div><div class="mc-row-control">';
echo '<input type="text" id="maveo_cognito_identity_pool_id" name="maveo_cognito_identity_pool_id" value="' . htmlspecialchars($poolDisplay) . '" placeholder="' . htmlspecialchars($poolPlaceholder) . '" autocomplete="off" /></div></div>';
echo '<div class="mc-row"><div class="mc-row-label">' . htmlspecialchars(mc_t('SETTINGS', 'LABEL_CLIENT_ID'), ENT_QUOTES, 'UTF-8') . '<span class="mc-row-h">' . htmlspecialchars(mc_t('SETTINGS', 'HINT_CLIENT_ID'), ENT_QUOTES, 'UTF-8') . '</span></div><div class="mc-row-control">';
echo '<input type="text" name="maveo_cognito_client_id" id="maveo_cognito_client_id" value="' . htmlspecialchars($m['cognitoClientId'] ?? '') . '" autocomplete="off" /></div></div>';
echo '<div class="mc-row"><div class="mc-row-label">' . htmlspecialchars(mc_t('SETTINGS', 'LABEL_REGION'), ENT_QUOTES, 'UTF-8') . '</div><div class="mc-row-control">';
echo '<input type="text" name="maveo_region" id="maveo_region" value="' . htmlspecialchars($m['region'] ?? MAVOECONNECT_LIB_DEFAULT_REGION) . '" autocomplete="off" /></div></div>';
echo '<div class="mc-row"><div class="mc-row-label">' . htmlspecialchars(mc_t('SETTINGS', 'LABEL_USE_TEST'), ENT_QUOTES, 'UTF-8') . '<span class="mc-row-h">' . htmlspecialchars(mc_t('SETTINGS', 'HINT_USE_TEST'), ENT_QUOTES, 'UTF-8') . '</span></div><div class="mc-row-control">';
echo '<label class="mc-switch"><input type="checkbox" id="maveo_use_test_endpoints" name="maveo_use_test_endpoints" value="1"' . (!empty($m['useTestEndpoints']) ? ' checked' : '') . ' /><span>' . htmlspecialchars(mc_t('SETTINGS', 'USE_TEST_LABEL'), ENT_QUOTES, 'UTF-8') . '</span></label>';
echo '</div></div>';
echo '<div class="mc-row"><div class="mc-row-label">' . htmlspecialchars(mc_t('SETTINGS', 'LABEL_IOT_HOSTNAME'), ENT_QUOTES, 'UTF-8') . '</div><div class="mc-row-control">';
echo '<input type="text" name="maveo_iot_hostname" id="maveo_iot_hostname" value="' . htmlspecialchars($m['iotHostname'] ?? '') . '" placeholder="' . htmlspecialchars('Leer = ' . MAVOECONNECT_LIB_DEFAULT_IOT_HOSTNAME) . '" autocomplete="off" /></div></div>';
echo '<div class="mc-row"><div class="mc-row-label">' . htmlspecialchars(mc_t('SETTINGS', 'LABEL_MQTT_SIGNING'), ENT_QUOTES, 'UTF-8') . '<span class="mc-row-h">' . htmlspecialchars(mc_t('SETTINGS', 'HINT_MQTT_SIGNING'), ENT_QUOTES, 'UTF-8') . '</span></div><div class="mc-row-control">';
echo '<input type="text" name="maveo_mqtt_wss_signing" id="maveo_mqtt_wss_signing" value="' . htmlspecialchars($m['mqttWssSigning'] ?? '') . '" autocomplete="off" /></div></div>';

echo '<p class="mc-section-title">';
mc_te('SETTINGS', 'EXPERT_DAEMON_TITLE');
echo '</p>';
echo '<div class="mc-row"><div class="mc-row-label">' . htmlspecialchars(mc_t('SETTINGS', 'LABEL_DAEMON_PORT'), ENT_QUOTES, 'UTF-8') . '<span class="mc-row-h">' . htmlspecialchars(mc_t('SETTINGS', 'HINT_DAEMON_PORT'), ENT_QUOTES, 'UTF-8') . '</span></div><div class="mc-row-control">';
echo '<input type="number" id="daemon_port" name="daemon_port" min="1024" max="65535" value="' . (int) ($daemon['port'] ?? 47832) . '" /></div></div>';
echo '<div class="mc-row"><div class="mc-row-label">' . htmlspecialchars(mc_t('SETTINGS', 'LABEL_LOG_LEVEL'), ENT_QUOTES, 'UTF-8') . '</div><div class="mc-row-control"><select id="logging_level" name="logging_level">';
foreach (['error', 'warn', 'info', 'debug'] as $lvl) {
    $sel = ($logging['level'] ?? 'info') === $lvl ? ' selected' : '';
    echo '<option value="' . htmlspecialchars($lvl) . '"' . $sel . '>' . htmlspecialchars($lvl) . '</option>';
}
echo '</select></div></div>';

echo '</div></details>';

echo '<div class="mc-save"><button type="submit" name="save" value="1">' . htmlspecialchars(mc_t('COMMON', 'SAVE'), ENT_QUOTES, 'UTF-8') . '</button></div>';
echo '</form>';
echo '</div>';

// ---------- JS (minimal; mostly form controllers + probe AJAX) ----------
?>
<script>
(function () {
  var lb = document.getElementById("mqtt_use_lb_broker");
  var row = document.getElementById("mc-mqtt-custom");
  function sMqtt() {
    if (lb && row) row.style.display = lb.checked ? "none" : "grid";
  }
  if (lb) lb.addEventListener("change", sMqtt);
  sMqtt();

  var emailEl = document.getElementById("maveo_email");
  var passEl = document.getElementById("maveo_password");
  var pick = document.getElementById("maveo_thing_pick");
  var inp = document.getElementById("maveo_thing_name");
  var msg = document.getElementById("mc_discover_msg");
  var banner = document.getElementById("mc_maveo_probe_banner");
  var chips = document.getElementById("mc_things_all");
  var bProbe = document.getElementById("mc_probe_login");
  var bRefresh = document.getElementById("mc_refresh_things");

  /** Strings injected from PHP/i18n so the JS error messages are translated. */
  var T = <?php echo json_encode([
      'discoverBusy' => mc_t('SETTINGS', 'PROBE_DISCOVER_BUSY'),
      'discoverEmpty' => mc_t('SETTINGS', 'PROBE_DISCOVER_EMPTY'),
      'bannerOk' => mc_t('SETTINGS', 'PROBE_BANNER_OK'),
      'bannerOkAccount' => mc_t('SETTINGS', 'PROBE_BANNER_OK_ACCOUNT'),
      'bannerFail' => mc_t('SETTINGS', 'PROBE_BANNER_FAIL'),
      'bannerNet' => mc_t('SETTINGS', 'PROBE_BANNER_NETWORK'),
      'daemonDown' => mc_t('SETTINGS', 'PROBE_DAEMON_DOWN'),
      'apiTokenMissing' => mc_t('SETTINGS', 'PROBE_API_TOKEN_MISSING'),
      'discoverOkPrefix' => mc_t('SETTINGS', 'PROBE_DISCOVER_OK'),
  ], JSON_UNESCAPED_UNICODE); ?>;

  function postProbe(body) {
    return fetch("settings.php?ajax_probe=1", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(function (r) {
      return r.json();
    });
  }

  function setBanner(ok, text) {
    if (!banner) return;
    banner.className = "mc-probe-banner mc-show " + (ok ? "mc-ok" : "mc-err");
    banner.textContent = text;
  }

  function clearPick() {
    while (pick && pick.options && pick.options.length > 1) pick.remove(1);
  }

  function applyThings(ts) {
    clearPick();
    ts = ts || [];
    ts.forEach(function (t) {
      var o = document.createElement("option");
      o.value = t.thingName;
      var a = t.attributes || {};
      var suf = a.model ? " (" + String(a.model) + ")" : "";
      o.textContent = String(t.thingName) + suf;
      pick.appendChild(o);
    });
    if (msg) {
      if (ts.length) {
        msg.textContent = T.discoverOkPrefix.replace("%d", String(ts.length));
        msg.style.color = "#5d4037";
      } else {
        msg.textContent = T.discoverEmpty;
        msg.style.color = "#c62828";
      }
    }
    if (chips) {
      chips.innerHTML = "";
      chips.classList.remove("mc-show");
      ts.forEach(function (t) {
        var li = document.createElement("li");
        li.textContent = String(t.thingName);
        chips.appendChild(li);
      });
      if (ts.length) chips.classList.add("mc-show");
    }
  }

  function setBusy(on) {
    [bProbe, bRefresh].forEach(function (b) {
      if (b) b.disabled = !!on;
    });
  }

  function humanizeProbeError(text) {
    var s = String(text || "").trim();
    var low = s.toLowerCase();
    if (
      low.indexOf("connection refused") !== -1 ||
      low.indexOf("47832") !== -1 ||
      low.indexOf("failed to connect") !== -1
    ) {
      return T.daemonDown.replace("%s", s);
    }
    if (low.indexOf("api token missing") !== -1) {
      return T.apiTokenMissing.replace("%s", s);
    }
    return s;
  }

  function runProbe(body) {
    setBusy(true);
    if (msg) {
      msg.textContent = T.discoverBusy;
      msg.style.color = "#546e7a";
    }
    postProbe(body)
      .then(function (j) {
        if (!j || j.ok === false || j.loginOk === false) {
          var err = humanizeProbeError(
            (j && (j.message || j.error)) || T.bannerFail,
          );
          setBanner(false, err);
          applyThings([]);
          return;
        }
        var okMsg = j && j.email ? T.bannerOkAccount.replace("%s", j.email) : T.bannerOk;
        setBanner(true, okMsg);
        applyThings(j.things || []);
      })
      .catch(function () {
        setBanner(false, humanizeProbeError(T.bannerNet));
        applyThings([]);
      })
      .finally(function () {
        setBusy(false);
      });
  }

  /** Pull current auth-stack overrides from the form so the user can probe EU vs US,
   *  prod vs test BEFORE saving. Empty values are dropped server-side. */
  function collectAuthOverrides() {
    function v(id) {
      var el = document.getElementById(id);
      return el && typeof el.value === "string" ? el.value.trim() : "";
    }
    var out = {};
    var pool = v("maveo_cognito_identity_pool_id");
    if (pool) out.cognitoIdentityPoolId = pool;
    var clientId = v("maveo_cognito_client_id");
    if (clientId) out.cognitoClientId = clientId;
    var region = v("maveo_region");
    if (region) out.region = region;
    var iotHost = v("maveo_iot_hostname");
    if (iotHost) out.iotHostname = iotHost;
    var sign = v("maveo_mqtt_wss_signing");
    if (sign) out.mqttWssSigning = sign;
    var testEl = document.getElementById("maveo_use_test_endpoints");
    if (testEl) out.useTestEndpoints = !!testEl.checked;
    return out;
  }

  if (bProbe && pick && inp && emailEl && passEl) {
    bProbe.addEventListener("click", function () {
      var body = collectAuthOverrides();
      body.email = emailEl.value.trim();
      body.password = passEl.value;
      body.maxThings = 120;
      runProbe(body);
    });
  }
  if (bRefresh && pick && inp) {
    bRefresh.addEventListener("click", function () {
      var body = collectAuthOverrides();
      body.maxThings = 120;
      runProbe(body);
    });
  }
  if (pick && inp) {
    pick.addEventListener("change", function () {
      if (pick.value) inp.value = pick.value;
    });
  }
})();
</script>
<?php
LBWeb::lbfooter();
