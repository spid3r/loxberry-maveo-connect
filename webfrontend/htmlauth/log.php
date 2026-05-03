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

if (!empty($_GET['clear']) && $_SERVER['REQUEST_METHOD'] === 'POST') {
    /**
     * "Log löschen": forwards to the daemon which truncates `daemon.log`,
     * deletes rotated backups, and clears the in-memory ring. We accept POST
     * only so a simple GET refresh cannot accidentally wipe the log.
     */
    header('Content-Type: application/json; charset=utf-8');
    $r = maveoconnect_daemon_request('POST', '/api/log/clear', []);
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
.mc-log-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:6px 0 4px;}
.mc-log-toolbar .mc-log-rotation{font-size:.82rem;color:#546e7a;margin-left:auto;}
.mc-log-clear-btn{
  appearance:none;border:1px solid #c62828;background:#fff;color:#c62828;
  padding:6px 14px;border-radius:8px;font-size:.86rem;cursor:pointer;font-weight:600;
}
.mc-log-clear-btn:hover{background:#c62828;color:#fff;}
.mc-log-clear-btn[disabled]{opacity:.55;cursor:wait;}
.mc-log-clear-flash{font-size:.84rem;color:#2e7d32;}
</style>';

maveoconnect_lb_page_start('log', $logExtraCss);

echo '<div class="mc-plugin-container">';
echo maveoconnect_plugin_header_bar();
echo '<p class="mc-settings-intro" style="margin-bottom:4px;">' . htmlspecialchars(mc_t('LOG', 'BODY_LEAD', 'Rolling excerpt from the Maveo daemon log (active log level under Settings → Advanced → Daemon log). This page fetches new lines about once per second.'), ENT_QUOTES, 'UTF-8') . '</p>';
echo '<p class="mc-log-meta">' . htmlspecialchars(mc_t('LOG', 'BODY_META', 'Live door movement and MQTT also appear on “Status & control”.'), ENT_QUOTES, 'UTF-8') . '</p>';
echo '<p class="mc-log-tip">' . htmlspecialchars(mc_t('LOG', 'TIP', 'Tip: for more detail set the level to “debug”, save settings, and restart the daemon — BlueFi and state lines will show up here.'), ENT_QUOTES, 'UTF-8') . '</p>';

echo '<div class="mc-log-toolbar">';
echo '<button type="button" id="mc_log_clear" class="mc-log-clear-btn" data-confirm="' . htmlspecialchars(mc_t('LOG', 'CLEAR_CONFIRM', 'Clear log file and rotated backups now?'), ENT_QUOTES, 'UTF-8') . '">'
    . htmlspecialchars(mc_t('LOG', 'CLEAR_BTN', 'Clear log'), ENT_QUOTES, 'UTF-8')
    . '</button>';
echo '<span id="mc_log_flash" class="mc-log-clear-flash" aria-live="polite"></span>';
echo '<span class="mc-log-rotation">' . htmlspecialchars(mc_t('LOG', 'ROTATION_HINT', 'Rotation: daemon.log → daemon.log.1 at 1 MiB; older copies are deleted.'), ENT_QUOTES, 'UTF-8') . '</span>';
echo '</div>';

echo '<pre id="mc_log_panel" class="mc-log-box" role="log" aria-live="polite"></pre>';
echo '<script>(function(){';
echo 'var panel=document.getElementById("mc_log_panel");';
echo 'var btn=document.getElementById("mc_log_clear");';
echo 'var flash=document.getElementById("mc_log_flash");';
echo 'function tick(){fetch("log.php?ajax=1",{credentials:"same-origin"}).then(function(r){return r.json();}).then(function(j){';
echo 'if(panel&&Array.isArray(j.lines))panel.textContent=j.lines.join(String.fromCharCode(10));}).catch(function(){});}';
echo 'tick();setInterval(tick,1000);';
echo 'if(btn){btn.addEventListener("click",function(){';
echo 'var msg=btn.getAttribute("data-confirm")||"Clear log?";';
echo 'if(!window.confirm(msg))return;';
echo 'btn.disabled=true;flash.textContent="";';
echo 'fetch("log.php?clear=1",{method:"POST",credentials:"same-origin"}).then(function(r){return r.json();}).then(function(j){';
echo 'if(j&&j.ok){flash.textContent=' . json_encode(mc_t('LOG', 'CLEAR_DONE', 'Log cleared.')) . ';if(panel)panel.textContent="";tick();}';
echo 'else{flash.textContent=' . json_encode(mc_t('LOG', 'CLEAR_FAILED', 'Clearing the log failed — check the daemon.')) . ';flash.style.color="#c62828";}';
echo '}).catch(function(){flash.textContent=' . json_encode(mc_t('LOG', 'CLEAR_FAILED', 'Clearing the log failed — check the daemon.')) . ';flash.style.color="#c62828";})';
echo '.finally(function(){btn.disabled=false;setTimeout(function(){flash.textContent="";flash.style.color="";},5000);});});}';
echo '})();</script>';
echo '</div>';

LBWeb::lbfooter();
