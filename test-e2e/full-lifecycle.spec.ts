/**
 * Uninstall/reinstall cycle + admin flows when E2E_LIVE=1.
 * Credential flow reads MAVO_* from .env; optional MAVO_THING_NAME or discovers via „Sticks laden“.
 */

import { expect, test, type Page } from "@playwright/test";
import {
  E2E_SKIP_UNINSTALL,
  PLUGIN_FOLDER,
  buildReleaseZip,
  e2eSettle,
  getMaveoCredentialEnvAvailable,
  getRequiredEnvVarsAvailable,
  pollMqttConnectedAjax,
  runOptionalDaemonRestartViaSsh,
  uninstallPluginUntilRemoved,
  uploadLatestPluginZipWithRetry,
  waitUntilDaemonHttpReachable,
  waitUntilPluginInList,
} from "./helpers/lifecycle.js";

const E2E_ENABLED = process.env.E2E_LIVE === "1";
const loxBerryEnv = getRequiredEnvVarsAvailable();
const maveoEnv = getMaveoCredentialEnvAvailable();

async function expectSettingsSavedBanner(page: Page): Promise<void> {
  await expect(
    page.locator(".mc-flash-banner.mc-flash-ok").filter({ hasText: /^Gespeichert\./ }),
  ).toBeVisible({ timeout: 45_000 });
}

test.describe("@e2e maveoconnect full lifecycle (destructive)", () => {
  test.skip(
    !E2E_ENABLED,
    "destructive E2E disabled. Use npm run test:e2e:full:go.",
  );
  test.skip(E2E_ENABLED && !loxBerryEnv.ok, `Missing LoxBerry .env: ${loxBerryEnv.missing.join(", ")}`);

  test.setTimeout(15 * 60 * 1000);

  test.beforeAll("build zip", async () => {
    const result = buildReleaseZip();
    if (result.status !== 0) {
      console.error(result.output);
      throw new Error(`npm run release:zip failed (${result.status})`);
    }
  });

  test.beforeAll("uninstall previous", async () => {
    if (E2E_SKIP_UNINSTALL) return;
    await uninstallPluginUntilRemoved(PLUGIN_FOLDER);
    await e2eSettle("E2E_POST_UNINSTALL_MS", 8_000);
  });

  test.beforeAll("upload + install", async () => {
    const result = await uploadLatestPluginZipWithRetry();
    if (result.status !== 0) {
      console.error(result.stderr || result.stdout);
      throw new Error(`deploy exit ${result.status}`);
    }
    await waitUntilPluginInList(PLUGIN_FOLDER);
    await e2eSettle("E2E_POST_INSTALL_MS", 25_000);

    /** Start/Reconnect Node-Daemon falls Plugin-Hooks (postinstall/postroot) auf dem Gerät ihn nicht automatisch gebunden haben. */
    const sshBoot = runOptionalDaemonRestartViaSsh();
    if (sshBoot.ran && sshBoot.status !== 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[e2e] E2E_SSH_RESTART_CMD after install exited ${sshBoot.status}. Output: ${sshBoot.output.slice(0, 1_500)}`,
      );
    }

    await waitUntilDaemonHttpReachable({ pluginFolder: PLUGIN_FOLDER });
  });

  test("admin UI shows overview after install", async ({ page }) => {
    await page.goto(`/admin/plugins/${PLUGIN_FOLDER}/index.php`, { timeout: 60_000 });
    await expect(page.locator("text=Maveo Connect").first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/garage door integration/i)).toBeVisible({ timeout: 15_000 });
    const banner = page.locator(".mc-plugin-container .mc-banner").first();
    await expect(banner).toBeVisible({ timeout: 15_000 });
    const bannerBg = await banner.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bannerBg, "overview banner soll Maveo-Gelb (#F8BF00 ≈ rgb 248,191,0) sein").toMatch(/248/i);
  });

  test("settings: save Maveo credentials (.env), optional discover, MQTT connects", async ({
    page,
    request,
  }) => {
    test.skip(E2E_ENABLED && !maveoEnv.ok, `Configure MAVO_EMAIL / MAVO_PASSWORD in .env: ${maveoEnv.missing.join(", ")}`);

    await page.goto(`/admin/plugins/${PLUGIN_FOLDER}/settings.php`, {
      timeout: 60_000,
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator("#maveo_email")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /anmeldung prüfen/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /liste aktualisieren \(gespeichert\)/i })).toBeVisible();
    const probeRgb = await page.locator("#mc_probe_login").evaluate((el) => {
      const s = getComputedStyle(el).backgroundColor;
      const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(s);
      if (!m) return null;
      return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), raw: s };
    });
    expect(
      probeRgb && probeRgb.r >= 235 && probeRgb.g >= 170 && probeRgb.b <= 40,
      `Primär-Button soll gelb wirken (${probeRgb?.raw ?? "kein RGB"})`,
    ).toBe(true);

    await page.fill("#maveo_email", (process.env.MAVO_EMAIL ?? "").trim());
    await page.fill("#maveo_password", (process.env.MAVO_PASSWORD ?? "").trim());

    const pool = (process.env.MAVO_COGNITO_IDENTITY_POOL_ID ?? "").trim();
    const clientId = (process.env.MAVO_COGNITO_CLIENT_ID ?? "").trim();
    const region = (process.env.MAVO_REGION ?? "").trim();
    const useTest = process.env.MAVO_USE_TEST_ENDPOINTS === "1";
    const needExpert = pool !== "" || clientId !== "" || region !== "" || useTest;

    if (needExpert) {
      await page.locator("details.mc-expert summary").click();
      if (pool !== "") await page.fill("#maveo_cognito_identity_pool_id", pool);
      if (clientId !== "") await page.fill("#maveo_cognito_client_id", clientId);
      if (region !== "") await page.fill("#maveo_region", region);
      const chk = page.locator("#maveo_use_test_endpoints");
      if (useTest && (await chk.count()) > 0) await chk.check();
      else await chk.uncheck().catch(() => {});
    }

    await page.getByRole("button", { name: /^Speichern$/i }).click();
    await expectSettingsSavedBanner(page);

    const thingFromEnv = (process.env.MAVO_THING_NAME ?? "").trim();
    if (thingFromEnv !== "") {
      await page.fill("#maveo_thing_name", thingFromEnv);
    } else {
      /** Passwortfeld ist nach POST oft leer; explizites Passwort wie in der App nötig. */
      await page.fill("#maveo_password", (process.env.MAVO_PASSWORD ?? "").trim());
      await page.getByRole("button", { name: /anmeldung prüfen/i }).click();
      await expect(page.locator("#mc_maveo_probe_banner.mc-show.mc-ok")).toBeVisible({ timeout: 120_000 });

      await page.waitForFunction(
        () => {
          const el = document.querySelector("#maveo_thing_pick") as HTMLSelectElement | null;
          return el !== null && el.options.length > 1;
        },
        undefined,
        { timeout: 120_000 },
      );
      await page.selectOption("#maveo_thing_pick", { index: 1 });
    }

    await page.getByRole("button", { name: /^Speichern$/i }).click();
    await expectSettingsSavedBanner(page);

    const restart = runOptionalDaemonRestartViaSsh();
    if (restart.ran) {
      expect(
        restart.status,
        `E2E_SSH_RESTART_CMD failed (${restart.status}) — ${restart.output.slice(0, 2_000)}`,
      ).toBe(0);
    }

    if (!restart.ran) {
      // eslint-disable-next-line no-console
      console.warn(
        "[e2e] No E2E_SSH_RESTART_CMD — MQTT connect may lag until daemon reloads credentials from disk.",
      );
    }

    await e2eSettle("E2E_POST_INSTALL_MS", restart.ran ? 5_000 : 2_000);

    const st = await pollMqttConnectedAjax(request, {
      pluginFolder: PLUGIN_FOLDER,
    });

    expect(
      st.mqttConnected,
      `MQTT did not reach connected within deadline. Last transport=${String(st.transport)} lastError=${String(st.lastError ?? "")}`,
    ).toBe(true);
  });
});
