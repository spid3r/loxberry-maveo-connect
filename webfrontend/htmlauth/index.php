<?php
require_once __DIR__ . '/loxberry_bootstrap.php';
require_once __DIR__ . '/maveo_paths.php';
require_once __DIR__ . '/maveo_ui.php';

$st = maveoconnect_daemon_request('GET', '/api/status');
$ok = !empty($st['ok']);
$mqtt = !empty($st['mqttConnected']);
$cardClass = 'mc-status-card';
if (!$ok) {
    $cardClass .= ' mc-err';
} elseif (!$mqtt) {
    $cardClass .= ' mc-warn';
}

$daemonError = htmlspecialchars(
    (string) ($st['error'] ?? mc_t('OVERVIEW', 'CARD_STATE_DAEMON_UNKNOWN', 'unbekannt')),
    ENT_QUOTES,
    'UTF-8',
);
$lineDaemon = $ok
    ? mc_t('OVERVIEW', 'CARD_STATE_DAEMON_OK', 'Daemon antwortet.')
    : sprintf(mc_t('OVERVIEW', 'CARD_STATE_DAEMON_NORESP', 'Keine Antwort: %s'), $daemonError);
$lineMqtt = $mqtt
    ? mc_t('OVERVIEW', 'CARD_STATE_MQTT_OK', 'MQTT verbunden.')
    : ($ok ? mc_t('OVERVIEW', 'CARD_STATE_MQTT_OFFLINE', 'MQTT derzeit nicht verbunden.') : '—');

maveoconnect_lb_page_start('overview');

echo '<div class="mc-plugin-container">';
echo maveoconnect_plugin_header_bar();
echo '<div class="mc-banner">';
echo '<p class="mc-sub">' . mc_t('OVERVIEW', 'BANNER_SUB', 'Garage door integration via the Marantec Maveo Connect Stick.') . '</p>';
echo '</div>';

echo '<div class="mc-status-grid">';
echo '<div class="' . htmlspecialchars($cardClass, ENT_QUOTES, 'UTF-8') . '">';
echo '<h3>' . mc_t('OVERVIEW', 'CARD_STATE_TITLE', 'Aktueller Ist-Zustand') . '</h3>';
echo '<p><strong>' . mc_t('OVERVIEW', 'CARD_STATE_DAEMON_LABEL', 'Daemon') . ':</strong> ' . $lineDaemon . '</p>';
echo '<p><strong>' . mc_t('OVERVIEW', 'CARD_STATE_MQTT_LABEL', 'MQTT') . ':</strong> ' . $lineMqtt . '</p>';
if ($ok) {
    $door = htmlspecialchars((string) ($st['doorLabel'] ?? '—'), ENT_QUOTES, 'UTF-8');
    $pos = htmlspecialchars(is_numeric($st['doorPosition'] ?? null) ? (string) $st['doorPosition'] : '?', ENT_QUOTES, 'UTF-8');
    echo '<p><strong>' . mc_t('OVERVIEW', 'CARD_STATE_DOOR_LABEL', 'Tür') . ':</strong> ' . $door . ' (' . $pos . ')</p>';
}
echo '<p><a class="mc-card-btn" href="status.php">' . mc_t('OVERVIEW', 'CARD_STATE_GO_LIVE', 'Zu Live-Status & Steuerung') . '</a></p>';
echo '</div>';

echo '<div class="mc-status-card">';
echo '<h3>' . mc_t('OVERVIEW', 'CARD_CONFIG_TITLE', 'Konfiguration') . '</h3>';
echo '<p>' . mc_t('OVERVIEW', 'CARD_CONFIG_LEAD', 'Maveo-Zugangsdaten, MQTT-Weiterleitung und erweiterte Optionen.') . '</p>';
echo '<p><a class="mc-card-btn" href="settings.php">' . mc_t('OVERVIEW', 'CARD_CONFIG_OPEN', 'Einstellungen öffnen') . '</a></p>';
echo '</div>';
echo '</div>';

echo '<div class="mc-alert">';
echo '<strong>' . mc_t('OVERVIEW', 'ALERT_NOTE', 'Hinweis:') . '</strong> '
    . mc_t('OVERVIEW', 'ALERT_BODY', 'Nur eine MQTT-Session pro Stick — die offizielle Maveo-App schließen, wenn dieses Plugin die Verbindung halten soll.');
echo '</div>';

echo '<details class="mc-legal-disclosure" style="margin-top:1rem;padding:0.75rem 1rem;border-radius:8px;border:1px solid #cfd8dc;background:#fafafa;">';
echo '<summary style="cursor:pointer;font-size:0.9rem;color:#455a64;">';
mc_te('OVERVIEW', 'LEGAL_SUMMARY', 'Legal (click to expand)');
echo '</summary>';
echo '<div class="mc-muted" style="margin-top:0.65rem;font-size:0.85rem;line-height:1.45;">';
mc_th('OVERVIEW', 'LEGAL_BLOCK_HTML', '');
echo '</div>';
echo '</details>';

echo '</div>';

LBWeb::lbfooter();
