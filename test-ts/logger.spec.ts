import { expect } from "chai";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger } from "../service/src/logger.js";

function makeTempLog(): { dir: string; file: string } {
  const dir = mkdtempSync(join(tmpdir(), "maveo-log-test-"));
  return { dir, file: join(dir, "daemon.log") };
}

describe("logger rotation", () => {
  it("rotates daemon.log → daemon.log.1 once it crosses maxBytes", () => {
    const { dir, file } = makeTempLog();
    try {
      // Use 16 KiB (== MIN_MAX_BYTES floor) so the test exercises the production
      // smallest-allowed threshold without our normalize() bumping it up.
      const log = createLogger("info", file, { maxBytes: 16 * 1024, keepFiles: 1 });
      const big = "x".repeat(800);
      for (let i = 0; i < 30; i++) log.info(`spam ${i} ${big}`);

      expect(existsSync(file), "live log exists").to.equal(true);
      expect(existsSync(`${file}.1`), "rotated backup exists").to.equal(true);

      const live = statSync(file).size;
      expect(live, "live log started fresh after rotation").to.be.lessThan(16 * 1024 + 4096);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("setRotation reconfigures threshold at runtime", () => {
    const { dir, file } = makeTempLog();
    try {
      const log = createLogger("info", file, { maxBytes: 1_000_000, keepFiles: 2 });
      log.info("a");
      expect(log.getRotation().maxBytes).to.equal(1_000_000);
      log.setRotation({ maxBytes: 256, keepFiles: 1 });
      expect(log.getRotation().maxBytes).to.equal(16 * 1024); // floored to MIN_MAX_BYTES
      expect(log.getRotation().keepFiles).to.equal(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("clear() truncates the live log, removes backups, and empties the ring", () => {
    const { dir, file } = makeTempLog();
    try {
      const log = createLogger("info", file, { maxBytes: 16 * 1024, keepFiles: 2 });
      const big = "y".repeat(800);
      for (let i = 0; i < 30; i++) log.info(`fill ${i} ${big}`);

      expect(log.getRecentLines().length).to.be.greaterThan(0);
      writeFileSync(`${file}.2`, "stale");

      const result = log.clear();
      expect(result.truncated).to.equal(true);
      expect(result.removedBackups).to.be.greaterThan(0);
      expect(result.ringEntriesCleared).to.be.greaterThan(0);
      expect(log.getRecentLines()).to.deep.equal([]);
      expect(statSync(file).size).to.equal(0);
      expect(existsSync(`${file}.1`)).to.equal(false);
      expect(existsSync(`${file}.2`)).to.equal(false);

      log.info("post-clear");
      expect(readFileSync(file, "utf8")).to.contain("post-clear");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keepFiles=0 disables rotation (file just grows)", () => {
    const { dir, file } = makeTempLog();
    try {
      const log = createLogger("info", file, { maxBytes: 16 * 1024, keepFiles: 0 });
      for (let i = 0; i < 60; i++) log.info(`x ${i} ${"z".repeat(800)}`);
      expect(existsSync(`${file}.1`)).to.equal(false);
      expect(statSync(file).size).to.be.greaterThan(16 * 1024);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
