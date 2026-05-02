/**
 * End-to-end status / log / control verification AGAINST AN ALREADY-INSTALLED plugin.
 *
 * Runs only when `E2E_LIVE=1` and `.env` has `LOXBERRY_*` credentials. The
 * destructive `full-lifecycle.spec.ts` runs before this file (alphabetical order +
 * `workers: 1` in playwright.config.ts), so by the time these tests execute the
 * appliance has the latest plugin ZIP installed and Maveo credentials saved.
 *
 * What we verify here (and where the screenshots are taken):
 *   - Daemon JSON status is well-formed: settingsOk + clientReady + transport in {connected, reclaiming}
 *   - MQTT reaches connected within deadline (`pollMqttConnectedAjax`)
 *   - Status page renders the live badge, door label, door image, light label
 *   - The door SVG referenced in `<img id="doorImg">` actually 200s on the appliance
 *   - Log page shows recent daemon log lines (Cognito login + MQTT activity)
 *   - Wiki-asset screenshots are refreshed under `docs/wiki-assets/` for README + DokuWiki
 *
 * Optional, **gated**, and only runs when `MAVO_E2E_PHYSICAL_DOOR=1`:
 *   - Light on → off round-trip (does NOT actuate the garage door itself)
 */

import { expect, test, type Page, type APIRequestContext } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import {
  PLUGIN_FOLDER,
  fetchDaemonAjaxStatus,
  getRequiredEnvVarsAvailable,
  pollDaemonStatusUntil,
  pollMqttConnectedAjax,
} from "./helpers/lifecycle.js";

const E2E_ENABLED = process.env.E2E_LIVE === "1";
const PHYSICAL_DOOR = process.env.MAVO_E2E_PHYSICAL_DOOR === "1";
const envCheck = getRequiredEnvVarsAvailable();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const WIKI_DIR = path.join(REPO_ROOT, "docs", "wiki-assets");

async function gotoAdminPage(
  page: Page,
  file: "index.php" | "status.php" | "settings.php" | "log.php",
  opts: { lang?: "de" | "en" } = {},
): Promise<void> {
  const url = opts.lang
    ? `/admin/plugins/${PLUGIN_FOLDER}/${file}?lang=${opts.lang}`
    : `/admin/plugins/${PLUGIN_FOLDER}/${file}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
}

test.describe("@e2e maveoconnect live status & control (read-only)", () => {
  test.skip(!E2E_ENABLED, "destructive E2E disabled. Use npm run test:e2e:full:go.");
  test.skip(E2E_ENABLED && !envCheck.ok, `Missing LoxBerry .env: ${envCheck.missing.join(", ")}`);

  test.setTimeout(8 * 60 * 1000);

  test("daemon status JSON: settingsOk + clientReady + transport sensible", async ({ request }) => {
    const initial = await fetchDaemonAjaxStatus(request, { pluginFolder: PLUGIN_FOLDER });
    expect(
      initial.settingsOk,
      `settingsOk must be true (credentials on disk). lastError=${String(initial.lastError ?? "")} transport=${String(initial.transport)}`,
    ).toBe(true);
    expect(initial.clientReady, "clientReady must be true once daemon built the stick client").toBe(true);
    expect(typeof initial.transport).toBe("string");
    expect(["connected", "reclaiming", "disconnected"]).toContain(initial.transport);
    expect(initial.stickSerial, "stickSerial should be a non-empty string").toBeTruthy();
  });

  test("MQTT reaches connected within deadline + status page reflects it", async ({ request, page }) => {
    /** Skip the 3-minute poll when full-lifecycle already left MQTT up (same worker, serial run). */
    let st = await fetchDaemonAjaxStatus(request, { pluginFolder: PLUGIN_FOLDER });
    if (!st.mqttConnected) {
      st = await pollMqttConnectedAjax(request, { pluginFolder: PLUGIN_FOLDER });
    }
    expect(
      st.mqttConnected,
      `MQTT did not connect: transport=${String(st.transport)} lastError=${String(st.lastError ?? "")}`,
    ).toBe(true);

    await gotoAdminPage(page, "status.php");
    await expect(page.locator("#mcConnBadge")).toBeVisible({ timeout: 30_000 });
    await expect(async () => {
      const txt = (await page.locator("#mcConnBadge").textContent())?.trim() ?? "";
      expect(/MQTT verbunden|MQTT connected/i.test(txt), `badge text: ${txt}`).toBe(true);
    }).toPass({ timeout: 90_000 });
  });

  test("status page renders door visual + light label without errors", async ({ page, request }) => {
    /** Wait until daemon has at least one StoA_s stick state response so doorPosition is numeric. */
    const stick = await pollDaemonStatusUntil(
      request,
      (s) => typeof s.doorPosition === "number" && !!s.doorLabel,
      { pluginFolder: PLUGIN_FOLDER, deadlineMs: 90_000 },
    );

    expect(stick.mqttConnected, "MQTT must be connected before checking door state").toBe(true);
    expect(typeof stick.doorPosition).toBe("number");
    expect([0, 1, 2, 3, 4, 5, 6]).toContain(stick.doorPosition);
    expect(stick.doorLabel, "door label must be non-empty").toBeTruthy();
    expect(typeof stick.lightOn === "boolean" || stick.lightOn === null).toBe(true);

    await gotoAdminPage(page, "status.php");

    /** Live AJAX tick will overwrite the SSR src once the next poll returns; wait for either. */
    await expect(async () => {
      const src = (await page.locator("#doorImg").getAttribute("src")) ?? "";
      expect(src, `doorImg src: ${src}`).toMatch(/^images\/door-(\d+|unknown)\.svg$/);
    }).toPass({ timeout: 30_000 });

    const src = (await page.locator("#doorImg").getAttribute("src")) ?? "";

    /** SVG asset must actually 200 on the appliance (catches missing files in the ZIP). */
    const r = await request.get(`/admin/plugins/${PLUGIN_FOLDER}/${src}`);
    expect(r.status(), `${src} should be 200 on appliance`).toBe(200);
    const svgBody = (await r.text()).trim();
    expect(svgBody.startsWith("<svg"), "door SVG body should start with <svg").toBe(true);

    const doorTxt = ((await page.locator("#doorLabel").textContent()) ?? "").trim();
    expect(doorTxt.length, `doorLabel should be non-empty: '${doorTxt}'`).toBeGreaterThan(0);

    const lightTxt = ((await page.locator("#lightVal").textContent()) ?? "").trim();
    expect(lightTxt.length, `lightVal should be non-empty: '${lightTxt}'`).toBeGreaterThan(0);

    /** mcLastErr is hidden by default; if visible AND non-empty → real error. */
    const errVisible = await page.locator("#mcLastErr").isVisible();
    if (errVisible) {
      const errTxt = ((await page.locator("#mcLastErrText").textContent()) ?? "").trim();
      expect(errTxt, `Status banner shows error: ${errTxt}`).toBe("");
    }
  });

  test("log page surfaces recent daemon activity", async ({ page }) => {
    await gotoAdminPage(page, "log.php");
    /** Plugin shell + plugin chrome render Maveo Connect; the log body should mention typical daemon keywords. */
    const body = await page.content();
    expect(body).toMatch(/Maveo Connect/i);

    /** Look for any of: MQTT events, Cognito login, stick state, "info" log-level prefix. */
    const interestingMatch = /MQTT|Cognito|stick state|listMaveoConnectSticks|maveo|info/i.test(body);
    expect(interestingMatch, "log page should contain at least one daemon log keyword").toBe(true);
  });

  test("wiki-asset screenshots refreshed (overview / status / settings, DE + EN)", async ({ page }) => {
    fs.mkdirSync(WIKI_DIR, { recursive: true });
    await page.setViewportSize({ width: 1366, height: 920 });

    /**
     * Always force the language via `?lang=`; the i18n helper sets a cookie which can
     * leak between tests/sessions. Forcing the URL param ensures DE assets render in DE
     * and EN assets render in EN, regardless of any sticky cookie.
     */
    const captures: Array<{
      file: "index.php" | "status.php" | "settings.php";
      lang: "de" | "en";
      out: string;
      settleMs: number;
    }> = [
      { file: "index.php", lang: "de", out: "maveoconnect-overview-de.png", settleMs: 800 },
      { file: "status.php", lang: "de", out: "maveoconnect-status-de.png", settleMs: 2_500 },
      { file: "settings.php", lang: "de", out: "maveoconnect-settings-de.png", settleMs: 800 },
      { file: "index.php", lang: "en", out: "maveoconnect-overview-en.png", settleMs: 800 },
      { file: "status.php", lang: "en", out: "maveoconnect-status-en.png", settleMs: 2_500 },
      { file: "settings.php", lang: "en", out: "maveoconnect-settings-en.png", settleMs: 800 },
    ];

    /**
     * Redact PII before saving any wiki screenshot. The user's email + stick serial
     * are personal data and must NEVER end up committed under `docs/wiki-assets/`.
     * Email gets a placeholder; stick serial / thing name keep a short prefix so the
     * screenshot still looks realistic.
     */
    const maskSerial = (v: string): string =>
      v.length > 6 ? v.slice(0, 4) + "•".repeat(Math.max(8, v.length - 4)) : "•".repeat(8);

    for (const c of captures) {
      await gotoAdminPage(page, c.file, { lang: c.lang });
      await page.waitForTimeout(c.settleMs);
      await page.evaluate((args) => {
        const { mask, fakeEmail } = args;
        const setText = (sel: string, txt: string) => {
          const el = document.querySelector(sel);
          if (el) el.textContent = txt;
        };
        const setVal = (sel: string, txt: string) => {
          const el = document.querySelector<HTMLInputElement>(sel);
          if (el) el.value = txt;
        };

        setVal("#maveo_email", fakeEmail);
        const thing = document.querySelector<HTMLInputElement>("#maveo_thing_name");
        if (thing && thing.value) thing.value = mask;
        setText("#mcStick", mask);
        const overviewState = document.querySelector(".mc-state-stick, .mc-stick-id");
        if (overviewState && overviewState.textContent) overviewState.textContent = mask;
      }, { mask: maskSerial("60031770671068012"), fakeEmail: "you@example.com" });
      await page.screenshot({ path: path.join(WIKI_DIR, c.out), fullPage: true });
    }

    /** Sanity: expect each PNG > 5 KB so we know a real screenshot got saved. */
    for (const c of captures) {
      const stat = fs.statSync(path.join(WIKI_DIR, c.out));
      expect(stat.size, `${c.out} too small (${stat.size}B)`).toBeGreaterThan(5_000);
    }
  });
});

test.describe("@e2e maveoconnect physical control round-trip (gated)", () => {
  test.skip(!E2E_ENABLED, "destructive E2E disabled. Use npm run test:e2e:full:go.");
  test.skip(
    E2E_ENABLED && !PHYSICAL_DOOR,
    "set MAVO_E2E_PHYSICAL_DOOR=1 to actuate the real device (light only).",
  );
  test.skip(E2E_ENABLED && !envCheck.ok, `Missing LoxBerry .env: ${envCheck.missing.join(", ")}`);

  test.setTimeout(5 * 60 * 1000);

  /**
   * Light command round-trip — we *deliberately* do NOT exercise the garage door itself
   * in automation. Light is the safe end-to-end test for the full PHP → daemon → MQTT →
   * stick → AWS IoT → MQTT → daemon → PHP loop.
   */
  test("light on/off via UI updates daemon status", async ({ page, request }) => {
    await gotoAdminPage(page, "status.php");

    async function clickAction(action: "light_on" | "light_off"): Promise<void> {
      const btn = page
        .locator(`form input[name="action"][value="${action}"]`)
        .first()
        .locator("..")
        .locator("button[type='submit']");
      await btn.click();
      await page.waitForLoadState("domcontentloaded");
    }

    async function pollLight(want: boolean, requestCtx: APIRequestContext): Promise<boolean> {
      const last = await pollDaemonStatusUntil(
        requestCtx,
        (s) => s.lightOn === want,
        { pluginFolder: PLUGIN_FOLDER, deadlineMs: 30_000, pollMs: 1_500 },
      );
      return last.lightOn === want;
    }

    await clickAction("light_on");
    expect(await pollLight(true, request), "lightOn should become true after 'Licht ein'").toBe(true);

    await clickAction("light_off");
    expect(await pollLight(false, request), "lightOn should become false after 'Licht aus'").toBe(false);
  });
});
