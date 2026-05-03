import { expect } from "chai";
// @ts-expect-error - .mjs script without .d.ts; we only need its public functions for tests.
import { parseVersionsFromChangelog, generateWikiDoc } from "../scripts/generate-wiki-doc.mjs";

type ParsedVersion = { version: string; bullets: string[] };

describe("wiki-doc CHANGELOG parser", () => {
  it("matches semantic-release level-1 (#) headings for minor/major releases", () => {
    const changelog = [
      "# [1.1.0](https://example/compare/v1.0.1...v1.1.0) (2026-05-03)",
      "",
      "### Bug Fixes",
      "",
      "* **build:** strip env ([abc1234](https://example/commit/abc1234))",
      "",
      "### Features",
      "",
      "* **api:** add control HTTP API ([def5678](https://example/commit/def5678))",
      "",
      "## [1.0.1](https://example/compare/v1.0.0...v1.0.1) (2026-05-02)",
      "",
      "### Bug Fixes",
      "",
      "* **docs:** add disclaimer ([12db4a2](https://example/commit/12db4a2))",
      "",
    ].join("\n");

    const versions: ParsedVersion[] = parseVersionsFromChangelog(changelog);
    expect(versions).to.have.length(2);
    expect(versions[0]?.version).to.equal("1.1.0");
    expect(versions[0]?.bullets).to.include.members([
      "**build:** strip env (abc1234)",
      "**api:** add control HTTP API (def5678)",
    ]);
    expect(versions[1]?.version).to.equal("1.0.1");
    expect(versions[1]?.bullets).to.deep.equal(["**docs:** add disclaimer (12db4a2)"]);
  });

  it("filters out pre-release versions (-beta.N) by default", () => {
    const changelog = [
      "# [1.1.0](url) (2026-05-03)",
      "* feat: ship",
      "## [1.0.1-beta.6](url) (2026-05-03)",
      "* fix: pre",
      "## [1.0.1](url) (2026-05-02)",
      "* fix: docs",
    ].join("\n");

    const versions: ParsedVersion[] = parseVersionsFromChangelog(changelog);
    expect(versions.map((v) => v.version)).to.deep.equal(["1.1.0", "1.0.1"]);
  });

  it("includes pre-release versions when explicitly requested", () => {
    const changelog = [
      "# [1.1.0](url) (2026-05-03)",
      "* feat: ship",
      "## [1.0.1-beta.6](url) (2026-05-03)",
      "* fix: pre",
    ].join("\n");

    const versions: ParsedVersion[] = parseVersionsFromChangelog(changelog, 8, { includePrerelease: true });
    expect(versions.map((v) => v.version)).to.deep.equal(["1.1.0", "1.0.1-beta.6"]);
  });

  it("does not pick up subsection headings as versions", () => {
    const changelog = [
      "## [1.0.0] — 2026-05-02",
      "### Bug Fixes",
      "- something fixed",
      "### Features",
      "- something added",
    ].join("\n");

    const versions: ParsedVersion[] = parseVersionsFromChangelog(changelog);
    expect(versions).to.have.length(1);
    expect(versions[0]?.version).to.equal("1.0.0");
    expect(versions[0]?.bullets).to.deep.equal(["something fixed", "something added"]);
  });

  it("renders the version into the template", () => {
    const template = "X {{VERSION_HISTORY}} Y {{SCREENSHOT_GALLERY}} Z";
    const changelog = "# [1.1.0](url) (2026-05-03)\n* feat: ship\n";
    const out: string = generateWikiDoc({ templateText: template, changelogText: changelog });
    expect(out).to.contain("**Version 1.1.0**");
    expect(out).to.contain("feat: ship");
    expect(out).to.match(/^X /);
  });
});
