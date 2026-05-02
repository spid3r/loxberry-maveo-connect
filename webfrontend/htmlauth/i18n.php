<?php
/**
 * Lightweight i18n helper for the Maveo Connect plugin.
 *
 * Resolves the active language from (in order):
 *   1. ?lang=xx URL parameter
 *   2. previously stored cookie `maveoconnect_lang`
 *   3. plugin setting (`settings.json` → `general.language`)
 *   4. LoxBerry general.cfg [BASE] LANG (when running on the appliance)
 *   5. Browser Accept-Language header
 *   6. Fallback "de" (German is the primary audience for Maveo / Marantec)
 *
 * Provides:
 *   MaveoConnectI18N::lang()              -> active language code (e.g. "de", "en")
 *   MaveoConnectI18N::availableLanguages()-> ["de", "en"] (files in templates/lang/)
 *   MaveoConnectI18N::all()               -> full translation array (for JS bridge)
 *   MaveoConnectI18N::t($section, $key, $fallback = null)
 *   mc_t($section, $key, $fallback)       -> shorthand
 *   mc_te($section, $key, $fallback)      -> echo+escape
 *   mc_th($section, $key, $fallback)      -> echo raw HTML (allowed for *_HTML keys)
 */

final class MaveoConnectI18N
{
    /** @var array<string, array<string, array<string, string>>> */
    private static $cache = [];
    /** @var string */
    private static $active = "de";
    /** @var bool */
    private static $bootstrapped = false;
    /** @var string */
    private static $langDir = "";
    /** @var string */
    private static $configuredLang = "";

    public static function bootstrap(string $langDir, string $configuredLang = ""): void
    {
        self::$langDir = $langDir;
        self::$configuredLang = trim(strtolower($configuredLang));
        self::$active = self::resolveLanguage();
        self::$bootstrapped = true;
    }

    public static function lang(): string
    {
        return self::$bootstrapped ? self::$active : "de";
    }

    /** @return array<int, string> */
    public static function availableLanguages(): array
    {
        if (!self::$langDir || !is_dir(self::$langDir)) {
            return ["de", "en"];
        }
        $out = [];
        foreach (scandir(self::$langDir) ?: [] as $entry) {
            if (preg_match('/^language_([a-z]{2})\.ini$/i', $entry, $m) === 1) {
                $out[] = strtolower($m[1]);
            }
        }
        sort($out);
        return $out ?: ["de", "en"];
    }

    /** @return array<string, array<string, string>> */
    public static function all(): array
    {
        return self::loadDictionary(self::lang());
    }

    public static function t(string $section, string $key, ?string $fallback = null): string
    {
        $dict = self::loadDictionary(self::lang());
        if (isset($dict[$section][$key])) {
            return $dict[$section][$key];
        }
        if (self::lang() !== "en") {
            $en = self::loadDictionary("en");
            if (isset($en[$section][$key])) {
                return $en[$section][$key];
            }
        }
        return $fallback ?? ($section . "." . $key);
    }

    private static function resolveLanguage(): string
    {
        $available = self::availableLanguages();
        $candidates = [];

        if (isset($_GET["lang"])) {
            $candidates[] = $_GET["lang"];
            // Sticky cookie: best-effort; some LoxBerry/Apache+PHP combinations have
            // shipped with output already started by the time htmlauth pages reach
            // here, so a setcookie() failure must not become a fatal user error.
            @setcookie("maveoconnect_lang", strtolower(substr(trim((string) $_GET["lang"]), 0, 2)), [
                "expires" => time() + 60 * 60 * 24 * 365,
                "path" => "/",
                "samesite" => "Lax",
            ]);
        }
        if (isset($_COOKIE["maveoconnect_lang"])) {
            $candidates[] = $_COOKIE["maveoconnect_lang"];
        }
        if (self::$configuredLang !== "") {
            $candidates[] = self::$configuredLang;
        }

        $lbhomedir = getenv("LBHOMEDIR");
        if ($lbhomedir) {
            $generalCfg = $lbhomedir . "/system/general.cfg";
            if (is_readable($generalCfg)) {
                $cfg = @parse_ini_file($generalCfg, true);
                if (is_array($cfg) && isset($cfg["BASE"]["LANG"])) {
                    $candidates[] = $cfg["BASE"]["LANG"];
                }
            }
        }

        $accept = $_SERVER["HTTP_ACCEPT_LANGUAGE"] ?? "";
        if ($accept !== "") {
            foreach (explode(",", $accept) as $part) {
                $code = strtolower(trim(explode(";", $part)[0]));
                if ($code !== "") {
                    $candidates[] = $code;
                }
            }
        }

        foreach ($candidates as $cand) {
            $cand = strtolower(substr(trim((string) $cand), 0, 2));
            if ($cand !== "" && in_array($cand, $available, true)) {
                return $cand;
            }
        }
        return in_array("de", $available, true)
            ? "de"
            : (in_array("en", $available, true) ? "en" : ($available[0] ?? "en"));
    }

    /** @return array<string, array<string, string>> */
    private static function loadDictionary(string $lang): array
    {
        if (isset(self::$cache[$lang])) {
            return self::$cache[$lang];
        }
        $file = self::$langDir . "/language_" . $lang . ".ini";
        $parsed = is_readable($file) ? @parse_ini_file($file, true) : false;
        self::$cache[$lang] = is_array($parsed) ? $parsed : [];
        return self::$cache[$lang];
    }
}

if (!function_exists("mc_t")) {
    function mc_t(string $section, string $key, ?string $fallback = null): string
    {
        return MaveoConnectI18N::t($section, $key, $fallback);
    }
}
if (!function_exists("mc_te")) {
    function mc_te(string $section, string $key, ?string $fallback = null): void
    {
        echo htmlspecialchars(MaveoConnectI18N::t($section, $key, $fallback), ENT_QUOTES, "UTF-8");
    }
}
if (!function_exists("mc_th")) {
    function mc_th(string $section, string $key, ?string $fallback = null): void
    {
        echo MaveoConnectI18N::t($section, $key, $fallback);
    }
}

/**
 * Resolve the language directory: prefer the LoxBerry installed location
 * ($LBHOMEDIR/templates/plugins/<plugin>/lang) so admins can override translations
 * per-appliance; fall back to the in-repo location during local development.
 */
if (!function_exists("maveoconnect_lang_dir")) {
    function maveoconnect_lang_dir(): string
    {
        $lbhomedir = getenv("LBHOMEDIR");
        if ($lbhomedir) {
            $candidate = rtrim($lbhomedir, "/") . "/templates/plugins/maveoconnect/lang";
            if (is_dir($candidate)) {
                return $candidate;
            }
        }
        // Repo layout (npm run plugins:deploy / git checkout — keep tests reproducible).
        return realpath(__DIR__ . "/../../templates/lang") ?: __DIR__ . "/../../templates/lang";
    }
}

/**
 * Read the language preference saved in settings.json (general.language). Optional;
 * defaults to "" so the resolver falls through to system / browser preferences.
 */
if (!function_exists("maveoconnect_settings_language")) {
    function maveoconnect_settings_language(): string
    {
        if (!function_exists("maveoconnect_load_settings_array")) {
            return "";
        }
        $s = maveoconnect_load_settings_array();
        if (!is_array($s)) {
            return "";
        }
        $lang = $s["general"]["language"] ?? "";
        return is_string($lang) ? strtolower(trim($lang)) : "";
    }
}
