<?php
require_once __DIR__ . '/loxberry_bootstrap.php';
require_once __DIR__ . '/maveo_paths.php';

LBWeb::lbheader('Maveo Connect', '', '');

echo '<p>Garage door integration via Marantec Maveo Connect Stick.</p>';
echo '<ul>';
echo '<li><a href="status.php">Status &amp; manual controls</a></li>';
echo '<li><a href="settings.php">Settings</a></li>';
echo '</ul>';
echo '<p class="ui-state-highlight ui-corner-all" style="padding:8px;margin-top:1em;">Only one MQTT session per stick: close the official Maveo app while this plugin holds the connection, or expect session contention.</p>';

LBWeb::lbfooter();
