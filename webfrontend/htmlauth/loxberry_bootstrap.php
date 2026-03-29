<?php
/**
 * LoxBerry: SDK files are on PHP include_path (no absolute paths).
 * @see https://wiki.loxberry.de/entwickler/php_develop_plugins_with_php/php_loxberry_sdk_documentation/php_module_loxberry_systemphp/start
 */
$__maveo_lb_sys = stream_resolve_include_path('loxberry_system.php');
if ($__maveo_lb_sys === false) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Cannot find loxberry_system.php (PHP include_path). This page must be served by LoxBerry Apache for plugins.';
    exit;
}
require_once $__maveo_lb_sys;

$__maveo_lb_web = stream_resolve_include_path('loxberry_web.php');
if ($__maveo_lb_web === false) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Cannot find loxberry_web.php (PHP include_path).';
    exit;
}
require_once $__maveo_lb_web;
