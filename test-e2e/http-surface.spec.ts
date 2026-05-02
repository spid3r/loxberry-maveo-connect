/**
 * Authenticated smoke requests against admin plugin URLs when E2E_LIVE=1.
 */

import { expect, test } from "@playwright/test";
import {
  PLUGIN_FOLDER,
  getRequiredEnvVarsAvailable,
  waitUntilDaemonHttpReachable,
} from "./helpers/lifecycle.js";

const E2E_ENABLED = process.env.E2E_LIVE === "1";
const envCheck = getRequiredEnvVarsAvailable();

test.describe("@e2e maveoconnect admin HTTP surface", () => {
  test.skip(
    !E2E_ENABLED,
    "set E2E_LIVE=1 (npm run test:e2e:full*) to enable live requests.",
  );
  test.skip(E2E_ENABLED && !envCheck.ok, `E2E_LIVE=1 missing .env: ${envCheck.missing.join(", ")}`);

  test.setTimeout(5 * 60 * 1000);

  test("Node daemon reachable (status.php ajax transport)", async () => {
    await waitUntilDaemonHttpReachable({ pluginFolder: PLUGIN_FOLDER });
  });

  test("admin index.php exposes Maveo Connect UI fragment", async ({ request }) => {
    const r = await request.get(`/admin/plugins/${PLUGIN_FOLDER}/index.php`, {
      timeout: 30_000,
    });
    expect(r.status()).toBe(200);
    const html = await r.text();
    expect(html).toMatch(/Maveo Connect|Garage door integration|Garagentor-Anbindung/i);
  });
});
