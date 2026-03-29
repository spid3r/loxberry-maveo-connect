<?php
require_once __DIR__ . '/loxberry_bootstrap.php';
require_once __DIR__ . '/maveo_paths.php';

if (!empty($_GET['ajax'])) {
    header('Content-Type: application/json; charset=utf-8');
    $r = maveoconnect_daemon_request('GET', '/api/status');
    echo json_encode($r);
    exit;
}

$flash = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = (string) ($_POST['action'] ?? '');
    switch ($action) {
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
$dp = $status['doorPosition'] ?? null;
$imgNum = is_numeric($dp) ? (int) $dp : 'unknown';
$imgSrc = 'images/door-' . $imgNum . '.svg';

LBWeb::lbheader('Maveo Connect — Status', '<style>
.maveo-status{display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start;margin-top:12px;}
.maveo-door-img{max-width:280px;border-radius:8px;background:#1a1a1a;padding:12px;}
.maveo-door-img img{max-width:100%;height:auto;display:block;transition:opacity .35s ease;}
.maveo-meta{min-width:220px;}
.maveo-actions form{display:inline;margin-right:6px;margin-bottom:6px;}
.maveo-actions .danger{background:#c62828;color:#fff;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;}
</style>', '');

echo '<p><a href="index.php">Index</a> · <a href="settings.php">Settings</a></p>';

if ($flash !== '') {
    echo '<p class="ui-state-highlight ui-corner-all" style="padding:8px;">' . htmlspecialchars($flash) . '</p>';
}

if (!$ok && isset($status['error'])) {
    echo '<p class="ui-state-error ui-corner-all" style="padding:8px;">Daemon: ' . htmlspecialchars((string) $status['error']) . '</p>';
}

echo '<div class="maveo-status">';
echo '<div class="maveo-door-img"><img id="doorImg" src="' . htmlspecialchars($imgSrc) . '" alt="Door state" /></div>';
echo '<div class="maveo-meta">';
echo '<p><strong>MQTT transport:</strong> ' . htmlspecialchars((string) ($status['transport'] ?? '—')) . '</p>';
echo '<p><strong>Connected:</strong> ' . (!empty($status['mqttConnected']) ? 'yes' : 'no') . '</p>';
echo '<p><strong>Stick serial:</strong> ' . htmlspecialchars((string) ($status['stickSerial'] ?? '—')) . '</p>';
echo '<p><strong>Door:</strong> <span id="doorLabel">' . htmlspecialchars((string) ($status['doorLabel'] ?? '—')) . '</span> <span id="doorPos">(' . htmlspecialchars(is_numeric($dp) ? (string) $dp : '?') . ')</span></p>';
echo '<p><strong>Light:</strong> <span id="lightVal">';
if (array_key_exists('lightOn', $status) && $status['lightOn'] !== null) {
    echo $status['lightOn'] ? 'on' : 'off';
} else {
    echo '—';
}
echo '</span></p>';
if (!empty($status['lastError'])) {
    echo '<p class="ui-state-error"><strong>Last error:</strong> ' . htmlspecialchars((string) $status['lastError']) . '</p>';
}
$sl = $status['sessionLoss'] ?? null;
if (is_array($sl)) {
    echo '<p class="ui-helper"><strong>Last session loss:</strong> intentional=' . (!empty($sl['intentionalDisconnect']) ? 'yes' : 'no')
        . ', remoteKickSuspected=' . (!empty($sl['suspectedRemoteSessionTakeover']) ? 'yes' : 'no') . '</p>';
}
echo '<p class="ui-helper">Manual reconnect clears session-contention backoff (see library README).</p>';
echo '</div></div>';

echo '<div class="maveo-actions" style="margin-top:20px;">';
echo '<form method="post"><input type="hidden" name="action" value="reconnect" /><button type="submit">Reconnect MQTT</button></form>';
echo '<form method="post"><input type="hidden" name="action" value="refresh_state" /><button type="submit">Refresh door/light</button></form>';
echo '<form method="post"><input type="hidden" name="action" value="light_on" /><button type="submit">Light on</button></form>';
echo '<form method="post"><input type="hidden" name="action" value="light_off" /><button type="submit">Light off</button></form>';
echo '<form method="post" onsubmit="return confirm(\'Send OPEN command to the door?\');"><input type="hidden" name="action" value="door_open" /><button type="submit" class="danger">Open door</button></form>';
echo '<form method="post" onsubmit="return confirm(\'Send CLOSE command?\');"><input type="hidden" name="action" value="door_close" /><button type="submit" class="danger">Close door</button></form>';
echo '<form method="post"><input type="hidden" name="action" value="door_stop" /><button type="submit">Stop</button></form>';
echo '<form method="post" onsubmit="return confirm(\'Send VENTILATE?\');"><input type="hidden" name="action" value="door_ventilate" /><button type="submit">Ventilate</button></form>';
echo '</div>';

echo '<script>
(function(){
  function mapDoorToImage(pos){
    if(pos===null||pos===undefined||pos==="")return "images/door-unknown.svg";
    var n=parseInt(pos,10);
    if(isNaN(n))return "images/door-unknown.svg";
    return "images/door-"+n+".svg";
  }
  function tick(){
    fetch("status.php?ajax=1",{credentials:"same-origin"})
      .then(function(r){return r.json();})
      .then(function(s){
        if(!s||s.ok===false)return;
        var img=document.getElementById("doorImg");
        if(img)img.src=mapDoorToImage(s.doorPosition);
        var dl=document.getElementById("doorLabel");
        if(dl)dl.textContent=s.doorLabel!=null?s.doorLabel:"—";
        var dp=document.getElementById("doorPos");
        if(dp)dp.textContent="("+(s.doorPosition!=null?s.doorPosition:"?")+")";
        var lv=document.getElementById("lightVal");
        if(lv){
          if(s.lightOn===true||s.lightOn===false)lv.textContent=s.lightOn?"on":"off";
          else lv.textContent="—";
        }
      })
      .catch(function(){});
  }
  setInterval(tick,4000);
})();
</script>';

LBWeb::lbfooter();
