<?php
require_once __DIR__ . '/loxberry_bootstrap.php';
require_once __DIR__ . '/maveo_paths.php';
require_once __DIR__ . '/maveo_ui.php';

if (!empty($_GET['ajax'])) {
    header('Content-Type: application/json; charset=utf-8');
    $r = maveoconnect_daemon_request('GET', '/api/status');
    echo json_encode($r);
    exit;
}

if (!empty($_GET['ajax_wait'])) {
    if (function_exists('set_time_limit')) {
        @set_time_limit(60);
    }
    header('Content-Type: application/json; charset=utf-8');
    $since = (int) ($_GET['rev'] ?? 0);
    $r = maveoconnect_daemon_status_wait($since, 38);
    echo json_encode($r);
    exit;
}

if (!empty($_GET['ajax_restart']) && strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? '')) === 'POST') {
    header('Content-Type: application/json; charset=utf-8');
    $rs = maveoconnect_daemon_restart();
    if ($rs['ok']) {
        usleep(700000);
        $st = maveoconnect_daemon_request('GET', '/api/status', null, false);
        echo json_encode(['ok' => true, 'restart' => $rs, 'status' => $st]);
    } else {
        echo json_encode(['ok' => false, 'restart' => $rs]);
    }
    exit;
}

$flash = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = (string) ($_POST['action'] ?? '');
    switch ($action) {
        case 'restart_daemon':
            $rs = maveoconnect_daemon_restart();
            $flash = $rs['ok']
                ? 'Daemon neu gestartet.'
                : ('Daemon-Restart fehlgeschlagen: ' . htmlspecialchars($rs['output'] ?: 'unbekannt'));
            break;
        case 'reconnect':
            maveoconnect_daemon_request('POST', '/api/reconnect', null);
            $flash = 'Reconnect requested.';
            break;
        case 'refresh_state':
            maveoconnect_daemon_request('POST', '/api/refresh-state', null);
            $flash = 'State refresh sent.';
            break;
        case 'light_on':
            maveoconnect_daemon_request('POST', '/api/light', ['on' => true]);
            $flash = 'Light on command sent.';
            break;
        case 'light_off':
            maveoconnect_daemon_request('POST', '/api/light', ['on' => false]);
            $flash = 'Light off command sent.';
            break;
        case 'door_stop':
            maveoconnect_daemon_request('POST', '/api/door', ['command' => 'stop']);
            $flash = 'Door stop sent.';
            break;
        case 'door_open':
            maveoconnect_daemon_request('POST', '/api/door', ['command' => 'open']);
            $flash = 'Door open sent.';
            break;
        case 'door_close':
            maveoconnect_daemon_request('POST', '/api/door', ['command' => 'close']);
            $flash = 'Door close sent.';
            break;
        case 'door_ventilate':
            maveoconnect_daemon_request('POST', '/api/door', ['command' => 'ventilate']);
            $flash = 'Ventilate sent.';
            break;
        default:
            $flash = 'Unknown action.';
    }
}

$status = maveoconnect_daemon_request('GET', '/api/status');
$ok = !empty($status['ok']);
$mcStreamRev = isset($status['_streamRev']) ? (int) $status['_streamRev'] : 0;
$dp = $status['doorPosition'] ?? null;
$imgNum = is_numeric($dp) ? (int) $dp : 'unknown';
$imgSrc = 'images/door-' . $imgNum . '.svg';
$mqttOn = !empty($status['mqttConnected']);
$badgeClass = $mqttOn ? 'ok' : ($ok ? 'warn' : 'err');
$badgeText = $mqttOn
    ? mc_t('STATUS', 'BADGE_MQTT_OK', 'MQTT verbunden')
    : ($ok ? mc_t('STATUS', 'BADGE_MQTT_DOWN', 'MQTT getrennt') : mc_t('STATUS', 'BADGE_DAEMON_DOWN', 'Daemon nicht erreichbar'));

$confirmRestart = htmlspecialchars(mc_t('STATUS', 'CONFIRM_RESTART', 'Daemon-Prozess neu starten? Settings werden neu eingelesen.'), ENT_QUOTES, 'UTF-8');
$confirmOpen = htmlspecialchars(mc_t('STATUS', 'CONFIRM_DOOR_OPEN', 'OPEN an das Tor senden?'), ENT_QUOTES, 'UTF-8');
$confirmClose = htmlspecialchars(mc_t('STATUS', 'CONFIRM_DOOR_CLOSE', 'CLOSE an das Tor senden?'), ENT_QUOTES, 'UTF-8');
$confirmVent = htmlspecialchars(mc_t('STATUS', 'CONFIRM_VENTILATE', 'VENTILATE senden?'), ENT_QUOTES, 'UTF-8');

maveoconnect_lb_page_start('status');

echo '<div class="mc-plugin-container">';

if ($flash !== '') {
    echo '<p class="mc-flash-banner mc-flash-ok ui-state-highlight mc-flash-muted ui-corner-all" style="padding:10px;margin:0 0 12px;border-radius:9px;">' . htmlspecialchars($flash) . '</p>';
}

if (!$ok && isset($status['error'])) {
    echo '<p class="ui-state-error ui-corner-all" style="padding:10px;margin:0 0 12px;">' . mc_t('OVERVIEW', 'CARD_STATE_DAEMON_LABEL', 'Daemon') . ': ' . htmlspecialchars((string) $status['error']) . '</p>';
}

echo '<p class="mc-lead">' . mc_t('STATUS', 'INTRO', 'Maveo Connect — Garagentor-Anbindung über den Marantec Maveo Connect Stick.') . '</p>';

echo '<div class="mc-panel">';
echo '<h2 class="mc-panel-h">' . mc_t('STATUS', 'HEAD_LIVE', 'Live-Status') . '</h2>';
echo '<div class="mc-live-head">';
echo '<span id="mcConnBadge" class="mc-badge ' . htmlspecialchars($badgeClass) . '">' . htmlspecialchars($badgeText) . '</span>';
echo '<span class="mc-ts">' . mc_t('STATUS', 'UPDATED_AT', 'Aktualisiert') . ': <time id="mcUpdated">' . htmlspecialchars(gmdate('H:i:s')) . '</time> UTC (' . mc_t('STATUS', 'POLL_HINT', 'Live long-poll') . ')</span>';
echo '</div>';
echo '<div class="mc-metrics">';
echo '<div class="mc-metric"><label>' . mc_t('STATUS', 'LABEL_TRANSPORT', 'Transport') . '</label><span id="mcTransport">' . htmlspecialchars((string) ($status['transport'] ?? '—')) . '</span></div>';
echo '<div class="mc-metric"><label>' . mc_t('STATUS', 'LABEL_STICK', 'Stick') . '</label><span id="mcStick">' . htmlspecialchars((string) ($status['stickSerial'] ?? '—')) . '</span></div>';
echo '<div class="mc-metric"><label>' . mc_t('STATUS', 'LABEL_DOOR_TEXT', 'Tür (Text)') . '</label><span id="doorLabel">' . htmlspecialchars((string) ($status['doorLabel'] ?? '—')) . '</span></div>';
echo '<div class="mc-metric"><label>' . mc_t('STATUS', 'LABEL_POSITION', 'Position') . '</label><span id="doorPos">' . htmlspecialchars(is_numeric($dp) ? (string) $dp : '?') . '</span></div>';
$lightShown = '—';
if (array_key_exists('lightOn', $status) && $status['lightOn'] !== null) {
    $lightShown = $status['lightOn']
        ? mc_t('STATUS', 'LIGHT_ON_SHORT', 'an')
        : mc_t('STATUS', 'LIGHT_OFF_SHORT', 'aus');
}
echo '<div class="mc-metric"><label>' . mc_t('STATUS', 'LABEL_LIGHT', 'Licht') . '</label><span id="lightVal">' . htmlspecialchars($lightShown) . '</span></div>';
echo '</div>';

echo '<p id="mcLastErr" class="ui-state-error ui-corner-all" style="padding:8px;display:' . (!empty($status['lastError']) ? 'block' : 'none') . ';"><strong>' . mc_t('STATUS', 'LAST_ERROR', 'Letzter Fehler') . ':</strong> <span id="mcLastErrText">' . (!empty($status['lastError']) ? htmlspecialchars((string) $status['lastError']) : '') . '</span></p>';

$sl = $status['sessionLoss'] ?? null;
if (is_array($sl)) {
    echo '<p class="mc-muted ui-helper"><strong>Letzter Sessionsverlust:</strong> absichtlich getrennt='
        . (!empty($sl['intentionalDisconnect']) ? 'ja' : 'nein')
        . ', Fernzugriff vermutet='
        . (!empty($sl['suspectedRemoteSessionTakeover']) ? 'ja' : 'nein') . '</p>';
}

echo '<div class="mc-door-row">';
echo '<div class="mc-door-visual"><img id="doorImg" src="' . htmlspecialchars($imgSrc) . '" alt="Door state" /></div>';
echo '<div style="flex:1;min-width:200px;">';
echo '<p class="mc-muted">' . mc_t('STATUS', 'HINT_DOOR_PIC', 'Torgrafik und Zahlen werden automatisch per AJAX aktualisiert. Bei Verbindungsproblemen „Reconnect MQTT“ oder „Refresh door/light“ nutzen.') . '</p>';
echo '</div></div>';
echo '</div>';

echo '<div class="mc-panel">';
echo '<h2 class="mc-panel-h">' . mc_t('STATUS', 'HEAD_CONN', 'Verbindung & Zustand') . '</h2>';
echo '<div class="mc-btn-grid">';
echo '<form method="post" onsubmit="return confirm(\'' . $confirmRestart . '\');"><input type="hidden" name="action" value="restart_daemon" /><button type="submit" class="mc-btn-secondary mc-btn-accent">' . mc_t('STATUS', 'ACTION_RESTART', 'Daemon neu starten') . '</button></form>';
echo '<form method="post"><input type="hidden" name="action" value="reconnect" /><button type="submit" class="mc-btn-secondary mc-btn-accent">' . mc_t('STATUS', 'ACTION_RECONNECT', 'MQTT neu verbinden') . '</button></form>';
echo '<form method="post"><input type="hidden" name="action" value="refresh_state" /><button type="submit" class="mc-btn-secondary mc-btn-accent">' . mc_t('STATUS', 'ACTION_REFRESH', 'Tür/Licht aktualisieren') . '</button></form>';
echo '</div>';
echo '<p class="mc-muted">' . mc_t('STATUS', 'HINT_RESTART', '„Daemon neu starten" beendet den Node-Prozess und startet ihn frisch — z. B. nach Credential-Wechsel oder bei „Daemon nicht erreichbar". „MQTT neu verbinden" setzt nur den Session-Contention-Backoff zurück.') . '</p>';
echo '</div>';

echo '<div class="mc-panel">';
echo '<h2 class="mc-panel-h">' . mc_t('STATUS', 'HEAD_MANUAL', 'Manuelle Steuerung') . '</h2>';
echo '<p class="mc-muted" style="margin-top:0;">' . mc_t('STATUS', 'HINT_MANUAL', 'Licht und Tor — wie in der Werks-App nur eine MQTT-Session gleichzeitig; offizielle Maveo-App schließen, wenn das Plugin aktiv ist.') . '</p>';
echo '<div class="mc-grid-2">';
echo '<div><strong>' . mc_t('STATUS', 'LIGHT_STATE', 'Licht') . '</strong><div class="mc-btn-grid">';
echo '<form method="post"><input type="hidden" name="action" value="light_on" /><button type="submit" class="mc-btn-secondary mc-btn-accent">' . mc_t('STATUS', 'ACTION_LIGHT_ON', 'Licht ein') . '</button></form>';
echo '<form method="post"><input type="hidden" name="action" value="light_off" /><button type="submit" class="mc-btn-secondary mc-btn-accent">' . mc_t('STATUS', 'ACTION_LIGHT_OFF', 'Licht aus') . '</button></form>';
echo '</div></div>';
echo '<div><strong>' . mc_t('STATUS', 'LABEL_DOOR_GROUP', 'Tor') . '</strong><div class="mc-btn-grid">';
echo '<form method="post"><input type="hidden" name="action" value="door_stop" /><button type="submit" class="mc-btn-secondary mc-btn-accent">' . mc_t('STATUS', 'ACTION_DOOR_STOP', 'Stop') . '</button></form>';
echo '<form method="post" onsubmit="return confirm(\'' . $confirmOpen . '\');"><input type="hidden" name="action" value="door_open" /><button type="submit" class="mc-danger">' . mc_t('STATUS', 'ACTION_DOOR_OPEN', 'Open') . '</button></form>';
echo '<form method="post" onsubmit="return confirm(\'' . $confirmClose . '\');"><input type="hidden" name="action" value="door_close" /><button type="submit" class="mc-danger">' . mc_t('STATUS', 'ACTION_DOOR_CLOSE', 'Close') . '</button></form>';
echo '<form method="post" onsubmit="return confirm(\'' . $confirmVent . '\');"><input type="hidden" name="action" value="door_ventilate" /><button type="submit" class="mc-danger">Ventilate</button></form>';
echo '</div></div>';
echo '</div>';
echo '</div>';

echo '<p class="mc-alert" style="margin-top:14px;">' . mc_t('STATUS', 'ALERT_SINGLE_SESSION', 'Nur eine MQTT-Session pro Stick möglich: offizielle Maveo-App schließen, wenn dieses Plugin die Verbindung hält.') . '</p>';

echo '</div>';

$jsT = [
    'badgeOk' => mc_t('STATUS', 'BADGE_MQTT_OK', 'MQTT verbunden'),
    'badgeWarn' => mc_t('STATUS', 'BADGE_MQTT_DOWN', 'MQTT getrennt'),
    'badgeErr' => mc_t('STATUS', 'BADGE_DAEMON_DOWN', 'Daemon nicht erreichbar'),
    'lightOn' => mc_t('STATUS', 'LIGHT_ON_SHORT', 'an'),
    'lightOff' => mc_t('STATUS', 'LIGHT_OFF_SHORT', 'aus'),
];

echo '<script>
var __MC_T = ' . json_encode($jsT, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT) . ';
(function(){
  function pad(n){ return n < 10 ? "0"+n : ""+n; }
  function utcNow(){ var d=new Date(); return pad(d.getUTCHours())+":"+pad(d.getUTCMinutes())+":"+pad(d.getUTCSeconds()); }
  function mapDoorToImage(pos){
    if(pos===null||pos===undefined||pos==="")return "images/door-unknown.svg";
    var n=parseInt(pos,10);
    if(isNaN(n))return "images/door-unknown.svg";
    return "images/door-"+n+".svg";
  }
  function setBadge(el, mqtt, httpOk){
    if(!el)return;
    el.className="mc-badge ";
    if(mqtt){ el.className+="ok"; el.textContent=__MC_T.badgeOk; return; }
    if(httpOk){ el.className+="warn"; el.textContent=__MC_T.badgeWarn; return; }
    el.className+="err"; el.textContent=__MC_T.badgeErr;
  }
  function applyStatus(s){
    if(!s)return;
    var tu=document.getElementById("mcUpdated");
    if(tu){ tu.textContent=utcNow(); }
    setBadge(document.getElementById("mcConnBadge"), !!s.mqttConnected, s.ok!==false);
    var tr=document.getElementById("mcTransport");
    if(tr)tr.textContent=s.transport!=null?s.transport:"—";
    var st=document.getElementById("mcStick");
    if(st)st.textContent=s.stickSerial!=null?s.stickSerial:"—";
    var img=document.getElementById("doorImg");
    if(img)img.src=mapDoorToImage(s.doorPosition);
    var dl=document.getElementById("doorLabel");
    if(dl)dl.textContent=s.doorLabel!=null?s.doorLabel:"—";
    var dp=document.getElementById("doorPos");
    if(dp)dp.textContent=s.doorPosition!=null?String(s.doorPosition):"?";
    var lv=document.getElementById("lightVal");
    if(lv){
      if(s.lightOn===true||s.lightOn===false)lv.textContent=s.lightOn?__MC_T.lightOn:__MC_T.lightOff;
      else lv.textContent="—";
    }
    var le=document.getElementById("mcLastErr");
    var letx=document.getElementById("mcLastErrText");
    if(le&&letx){
      if(s.lastError){
        letx.textContent=s.lastError;
        le.style.display="block";
      } else {
        letx.textContent="";
        le.style.display="none";
      }
    }
  }
  var streamRev = ' . $mcStreamRev . ';
  var pollLoopRunning = false;
  async function resyncSnapshot(){
    try {
      var r2 = await fetch("status.php?ajax=1", { credentials: "same-origin" });
      var snap = await r2.json();
      applyStatus(snap);
      if(snap && typeof snap._streamRev === "number") streamRev = snap._streamRev;
    } catch (e2) {}
  }
  async function realtimeLoop(){
    if (pollLoopRunning) return;
    pollLoopRunning = true;
    while (document.visibilityState !== "hidden") {
      try {
        var r = await fetch("status.php?ajax_wait=1&rev="+streamRev, { credentials: "same-origin" });
        var s = await r.json();
        if (!s) { await new Promise(function(res){ setTimeout(res, 1500); }); continue; }
        if (s.waitAborted) {
          if (typeof s._streamRev === "number") streamRev = s._streamRev;
          await resyncSnapshot();
          await new Promise(function(res){ setTimeout(res, 500); });
          continue;
        }
        if (typeof s._streamRev === "number") streamRev = s._streamRev;
        applyStatus(s);
      } catch (e) {
        await new Promise(function(res){ setTimeout(res, 2000); });
      }
    }
    pollLoopRunning = false;
  }
  realtimeLoop();
  document.addEventListener("visibilitychange", function(){
    if (document.visibilityState === "visible") realtimeLoop();
  });
})();
</script>';

LBWeb::lbfooter();
