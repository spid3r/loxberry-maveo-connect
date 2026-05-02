<?php

/**
 * Shared chrome — pattern aligned with loxberry-api-abfall-io (LBWeb navbar + global $htmlhead).
 *
 * @see https://wiki.loxberry.de/entwickler/php_develop_plugins_with_php/php_loxberry_sdk_documentation/php_module_loxberry_webphp/navigation_bar_php
 */

/**
 * @param 'overview'|'status'|'log'|'settings' $active
 */
function maveoconnect_navbar(string $active): void
{
    global $navbar;
    $navbar = [];
    $i = 0;
    /** LoxBerry template expects numeric active flags (same as Abfall plugin). */
    $navbar[$i++] = [
        'Name' => mc_t('NAV', 'TAB_OVERVIEW', 'Übersicht'),
        'URL' => 'index.php',
        'active' => $active === 'overview' ? 1 : 0,
    ];
    $navbar[$i++] = [
        'Name' => mc_t('NAV', 'TAB_STATUS', 'Status & Steuerung'),
        'URL' => 'status.php',
        'active' => $active === 'status' ? 1 : 0,
    ];
    $navbar[$i++] = [
        'Name' => mc_t('NAV', 'TAB_LOG', 'Protokoll'),
        'URL' => 'log.php',
        'active' => $active === 'log' ? 1 : 0,
    ];
    $navbar[$i++] = [
        'Name' => mc_t('NAV', 'TAB_SETTINGS', 'Einstellungen'),
        'URL' => 'settings.php',
        'active' => $active === 'settings' ? 1 : 0,
    ];
}

/**
 * Tiny inline language switcher: ?lang=de | ?lang=en. Stays in-page so users keep
 * their tab; the cookie set by MaveoConnectI18N::resolveLanguage persists across
 * subsequent navigations.
 */
function maveoconnect_render_lang_switcher(): string
{
    $current = MaveoConnectI18N::lang();
    $available = MaveoConnectI18N::availableLanguages();
    $self = strtok((string) ($_SERVER['REQUEST_URI'] ?? ''), '?');
    $links = [];
    foreach ($available as $code) {
        $label = mc_t('COMMON', 'LANGUAGE_OPTION_' . $code, strtoupper($code));
        $isActive = $code === $current;
        $links[] = $isActive
            ? '<strong>' . htmlspecialchars($label, ENT_QUOTES, 'UTF-8') . '</strong>'
            : '<a href="' . htmlspecialchars($self . '?lang=' . $code, ENT_QUOTES, 'UTF-8')
              . '">' . htmlspecialchars($label, ENT_QUOTES, 'UTF-8') . '</a>';
    }
    return '<div class="mc-lang-switch">'
        . htmlspecialchars(mc_t('COMMON', 'LANGUAGE_LABEL', 'Sprache'), ENT_QUOTES, 'UTF-8')
        . ': ' . implode(' · ', $links) . '</div>';
}

/**
 * Abfall-like layout tokens + operational widgets (panels, metrics, badges).
 */
function maveoconnect_styles(): string
{
    return <<<'CSS'
<style>
*{box-sizing:border-box;}
.mc-plugin-container{
  max-width:960px;margin:0 auto;padding:16px;
  --mc-primary:#F8BF00;
  --mc-primary-hover:#e0ac00;
  --mc-primary-ink:#1a1a1a;
  --mc-primary-soft:rgba(248,191,0,.2);
  --mc-primary-muted:rgba(248,191,0,.12);
}
.mc-banner{
  background:var(--mc-primary);color:var(--mc-primary-ink);padding:18px 20px;border-radius:8px;margin:0 0 18px;
  box-shadow:0 2px 8px rgba(0,0,0,.12);
}
.mc-banner h2{margin:0 0 6px;font-size:1.35em;font-weight:600;}
.mc-banner .mc-sub{font-size:.9em;opacity:.88;line-height:1.45;}
.mc-status-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin:0 0 18px;}
.mc-status-card{
  background:#fff;border-radius:8px;padding:18px;border-left:4px solid var(--mc-primary);
  box-shadow:0 2px 8px rgba(0,0,0,.08);
}
.mc-status-card.mc-warn{border-left-color:#ff9800;}
.mc-status-card.mc-err{border-left-color:#e53935;}
.mc-status-card h3{margin:0 0 10px;color:var(--mc-primary-ink);font-size:1.05em;font-weight:600;}
.mc-status-card p{margin:0 0 12px;color:#555;font-size:.9rem;line-height:1.45;}
a.mc-card-btn{display:inline-block;padding:10px 18px;border-radius:6px;background:var(--mc-primary);color:var(--mc-primary-ink)!important;text-decoration:none;font-weight:600;font-size:.9em;border:1px solid rgba(0,0,0,.08);}
a.mc-card-btn:hover{background:var(--mc-primary-hover);}
.mc-lead{font-size:.95rem;line-height:1.45;margin:0 0 12px;color:#333;}
.mc-panel{
  margin:14px 0;padding:14px;border-radius:8px;background:#fff;border:1px solid #e0e0e0;
  box-shadow:0 2px 8px rgba(0,0,0,.06);
}
.mc-panel-h{margin:0 0 12px;font-size:1.1rem;font-weight:600;color:var(--mc-primary-ink);border-bottom:1px solid #e8e8e8;padding-bottom:8px;}
.mc-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
@media (max-width:640px){.mc-grid-2{grid-template-columns:1fr;}}
.mc-badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.03em;}
.mc-badge.ok{background:var(--mc-primary-soft);color:#3e2723;}
.mc-badge.warn{background:#fff8e1;color:#f57f17;}
.mc-badge.err{background:#ffcdd2;color:#b71c1c;}
.mc-live-head{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:12px;}
.mc-ts{font-size:.8rem;color:#555;}
.mc-metrics{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin:12px 0;}
.mc-metric{padding:10px;background:#f8f9fa;border-radius:6px;border:1px solid #e8e8e8;}
.mc-metric label{display:block;font-size:.72rem;text-transform:uppercase;color:#666;margin-bottom:4px;}
.mc-metric span{font-size:1.05rem;font-weight:600;}
.mc-door-row{display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start;}
.mc-door-visual{flex:1;min-width:240px;text-align:center;}
.mc-door-visual img{
  max-width:300px;width:100%;height:auto;display:block;margin:0 auto;border-radius:8px;
  background:#1f1f1f;padding:12px;border:1px solid #333;transition:opacity .25s ease;
}
.mc-btn-grid{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;}
.mc-btn-grid form{display:inline;margin:0;}
.mc-btn-secondary{background:#ecf0f1;color:#333!important;border:1px solid #ddd;padding:10px 14px;border-radius:6px;cursor:pointer;font-size:.9em;font-weight:500;}
.mc-btn-secondary:hover{background:#e0e4e6;}
.mc-danger{background:#c62828;color:#fff!important;border:none;padding:10px 14px;border-radius:6px;cursor:pointer;font-weight:500;}
.mc-muted{font-size:.85rem;color:#555;margin-top:12px;line-height:1.4;}
.mc-alert{background:#fff9e6;border:1px solid rgba(248,191,0,.45);border-radius:8px;padding:12px 14px;font-size:.88rem;line-height:1.45;color:#4e342e;margin:14px 0 0;}
/* Neutralisiert grünes LoxBerry/jQuery‑UI („ui-state-highlight“) im Pluginbereich */
.mc-plugin-container .ui-state-highlight.mc-flash-muted,
.mc-plugin-container .mc-flash-banner.mc-flash-ok{
  background:#fff9e6!important;background-image:none!important;
  border:1px solid rgba(248,191,0,.5)!important;color:#3e2723!important;
}
.mc-plugin-container .mc-flash-banner.mc-flash-err{
  background:#ffebee!important;background-image:none!important;
  border:1px solid #ef9a9a!important;color:#b71c1c!important;
}
.mc-btn-secondary.mc-btn-accent{border-color:rgba(248,191,0,.55);background:#fffbeb;}
.mc-btn-secondary.mc-btn-accent:hover{background:#fff3c4;}
.mc-lang-switch{font-size:.78rem;color:#607d8b;text-align:right;margin:-4px 0 12px;}
.mc-lang-switch a{color:#455a64;text-decoration:none;}
.mc-lang-switch a:hover{text-decoration:underline;}
.mc-lang-switch strong{color:var(--mc-primary-ink);}
/* LoxBerry lbheader title: plugin glyph + text (same idea as abfall-io) */
.mc-lb-brand{display:inline-flex;align-items:center;gap:10px;vertical-align:middle;line-height:1.15;}
.mc-lb-brand-icon{display:block;width:40px;height:40px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,.22);flex-shrink:0;}
.mc-lb-brand-text{font-weight:600;font-size:1.05em;}
</style>
CSS;
}

/**
 * LoxBerry header title: icon (squircle PNG) + plugin name — same idea as abfall-io.
 */
function maveoconnect_header_brand_html(): string
{
    $title = htmlspecialchars(mc_t('COMMON', 'PLUGIN_TITLE', 'Maveo Connect'), ENT_QUOTES, 'UTF-8');
    return '<span class="mc-lb-brand">'
        . '<img src="icon_64.png" width="40" height="40" alt="" class="mc-lb-brand-icon" decoding="async" />'
        . '<span class="mc-lb-brand-text">' . $title . '</span>'
        . '</span>';
}

/**
 * Abfall-style: styles go to global $htmlhead; LBWeb::lbheader(title, '', '').
 *
 * @param 'overview'|'status'|'log'|'settings' $activeTab
 */
function maveoconnect_lb_page_start(string $activeTab, string $extraHeadHtml = ''): void
{
    global $htmlhead;
    $htmlhead = maveoconnect_styles() . $extraHeadHtml;
    maveoconnect_navbar($activeTab);
    LBWeb::lbheader(maveoconnect_header_brand_html(), '', '');
    echo maveoconnect_render_lang_switcher();
}
