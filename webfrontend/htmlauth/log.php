<?php
require_once __DIR__ . '/loxberry_bootstrap.php';
require_once __DIR__ . '/maveo_paths.php';
require_once __DIR__ . '/maveo_ui.php';

if (!empty($_GET['ajax'])) {
    header('Content-Type: application/json; charset=utf-8');
    $lim = isset($_GET['limit']) ? (int) $_GET['limit'] : 450;
    $lim = max(20, min(520, $lim));
    $r = maveoconnect_daemon_request('GET', '/api/log/recent?limit=' . $lim);
    echo json_encode($r);
    exit;
}

$logExtraCss = '<style>
.mc-log-meta{font-size:.86rem;color:#607d8b;margin:4px 0 14px;}
.mc-log-box{
  background:#141c14;color:#e8fce8;font-family:ui-monospace,Consolas,monospace;
  font-size:12px;line-height:1.48;padding:14px 16px;border-radius:11px;
  max-height:min(72vh,560px);overflow:auto;white-space:pre-wrap;word-break:break-word;
  border:1px solid #2e4a32;margin:10px 0 0;
}
.mc-log-tip{background:#fff9e6;padding:11px 14px;border-radius:9px;font-size:.84rem;line-height:1.45;color:#4e342e;margin:0 0 12px;border:1px solid rgba(248,191,0,.45);}
</style>';

maveoconnect_lb_page_start('log', $logExtraCss);

echo '<div class="mc-plugin-container">';
echo maveoconnect_plugin_header_bar();
echo '<p class="mc-settings-intro" style="margin-bottom:4px;"><strong>Dauerhaftes Protokoll</strong> des Maveo-Daemon (aktuell aktiv: Log-Level unter Einstellungen → Entwicklung). Die Seite fragt etwa jede Sekunde nach neuen Zeilen.</p>';
echo '<p class="mc-log-meta">Schnelle Torbewegungen und MQTT stehen zusätzlich live unter „Status&nbsp;&amp; Steuerung“.</p>';
echo '<p class="mc-log-tip"><strong>Hinweis:</strong> Für mehr Details dort Log-Level auf <code>debug</code> setzen, Daemon neu starten — dann siehst du u.&nbsp;a. BlueFi/Zustände hier.</p>';
echo '<pre id="mc_log_panel" class="mc-log-box" role="log" aria-live="polite"></pre>';
echo '<script>(function(){';
echo 'var panel=document.getElementById("mc_log_panel");';
echo 'function tick(){fetch("log.php?ajax=1",{credentials:"same-origin"}).then(function(r){return r.json();}).then(function(j){';
echo 'if(panel&&Array.isArray(j.lines))panel.textContent=j.lines.join(String.fromCharCode(10));}).catch(function(){});}';
echo 'tick();setInterval(tick,1000);})();</script>';
echo '</div>';

LBWeb::lbfooter();
