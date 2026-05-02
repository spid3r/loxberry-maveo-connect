/**
 * Default Marantec Maveo cloud stack baked into THIS plugin.
 *
 * Why bake them in here when the upstream library deliberately doesn't?
 * `maveo-connect-stick-client` is a generic, vendor-default-free library so the
 * published npm artifact never redistributes third-party configuration. A
 * **LoxBerry plugin**, on the other hand, has to be usable for the average end-user
 * who only knows their **email** and **password** — they should not have to dig
 * a `cognitoIdentityPoolId` out of an APK. So the plugin layer (this file)
 * carries the EU-central-1 prod stack as a default, and the Settings UI lets
 * power users override every field individually.
 *
 * Source: discovered from the official Maveo mobile app's `awsconfiguration.json`
 * (see the upstream library's `docs/AUTH_FLOW.md` for the discovery procedure).
 *
 * # Why base64?
 *
 * The IDs / hostnames below are reverse-engineered from the official mobile app
 * and are publicly observable on every TLS handshake the Maveo app makes — so
 * keeping them out of the GitHub repo is **not** a security control. We still
 * base64-encode them so the literal vendor strings (region-specific Cognito
 * pool ID, client ID, IoT broker hostname) don't appear in casual GitHub
 * keyword searches, scrapers, or copy-pasted issue snippets. Treat this as
 * deterrent obfuscation, not encryption.
 *
 * If Marantec rotates these IDs / hostnames, only the strings below need an
 * update; the PHP UI (`webfrontend/htmlauth/maveo_paths.php`) carries the same
 * base64 constants — keep both files in sync.
 */

const decode = (b64: string): string => Buffer.from(b64, "base64").toString("utf8");

const ENC = {
  name: "ZXUtY2VudHJhbC0xIHByb2Q=",
  region: "ZXUtY2VudHJhbC0x",
  cognitoClientId: "MzRlcnVxaHZ2bm5paWc1YmNjcnJlNnMwY2s=",
  cognitoIdentityPoolId:
    "ZXUtY2VudHJhbC0xOmIzZWJlNjA1LTUzYzktNDYzZS04NzM4LTcwYWUwMWIwNDJlZQ==",
  userPoolId: "ZXUtY2VudHJhbC0xX296Ylc4clRBag==",
  iotHostname: "ZXUtY2VudHJhbC0xLmlvdC1wcm9kLm1hcmFudGVjLWNsb3VkLmRl",
} as const;

export const MAVEO_DEFAULT_STACK = {
  name: decode(ENC.name),
  region: decode(ENC.region),
  cognitoClientId: decode(ENC.cognitoClientId),
  cognitoIdentityPoolId: decode(ENC.cognitoIdentityPoolId),
  /** Cognito User Pool id — kept here for ops/docs; the library derives it from the JWT and does not need it as input. */
  userPoolId: decode(ENC.userPoolId),
  iotHostname: decode(ENC.iotHostname),
} as const;

export type MaveoStackDefaults = typeof MAVEO_DEFAULT_STACK;
