import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, truncateSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import type { LogLevelName } from "./settings.js";

const ORDER: LogLevelName[] = ["error", "warn", "info", "debug"];

const RING_CAPACITY = 520;

/**
 * Default rotation policy — keep the on-disk footprint of `daemon.log` bounded
 * without depending on system-level logrotate (LoxBerry does not auto-rotate
 * plugin logs by default). At 1 MiB per file × 1 backup we cap the daemon's
 * log usage in `$LBPLOG/maveoconnect/` at ~2 MiB. Users can override via
 * `settings.json → logging.maxBytes / logging.keepFiles` for verbose `debug`
 * sessions or extra-tiny SD cards.
 */
const DEFAULT_MAX_BYTES = 1024 * 1024;
const DEFAULT_KEEP_FILES = 1;
const MIN_MAX_BYTES = 16 * 1024;
const MAX_KEEP_FILES = 9;

export type RingBufferedLogger = ReturnType<typeof createLogger>;

export type LoggerRotationOptions = {
  /** Rotate `daemon.log` once it grows past this many bytes. 0/undef → use default (1 MiB). */
  maxBytes?: number;
  /** How many `daemon.log.N` backups to retain; total disk = (keepFiles + 1) × maxBytes. 0 disables rotation. */
  keepFiles?: number;
};

export function createLogger(initialLevel: LogLevelName, logPath: string, rotation: LoggerRotationOptions = {}) {
  let minIdx = Math.max(0, ORDER.indexOf(initialLevel));
  let level: LogLevelName = initialLevel;
  const ring: string[] = [];

  let maxBytes = normalizeMaxBytes(rotation.maxBytes);
  let keepFiles = normalizeKeepFiles(rotation.keepFiles);

  const ensureDir = () => {
    const d = dirname(logPath);
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  };

  const pushRing = (line: string) => {
    ring.push(line.endsWith("\n") ? line.slice(0, -1) : line);
    if (ring.length > RING_CAPACITY) {
      ring.splice(0, ring.length - RING_CAPACITY);
    }
  };

  /**
   * Rotate when the current file is *already* at/over the threshold. We check before
   * each append so the file never grows much past `maxBytes`. `appendFileSync` is
   * called sync from a single Node process, so no inter-process locking is needed.
   *
   * Cheap path: most calls just `statSync` (one syscall) and exit; only on rotation
   * day do we move/delete files.
   */
  const rotateIfNeeded = (incomingBytes: number): void => {
    if (keepFiles <= 0 || maxBytes <= 0) return;
    let currentSize = 0;
    try {
      currentSize = statSync(logPath).size;
    } catch {
      return;
    }
    if (currentSize + incomingBytes < maxBytes) return;

    /** Drop the oldest backup, then shift `.N` → `.N+1`, then `daemon.log` → `daemon.log.1`. */
    try {
      const oldest = `${logPath}.${keepFiles}`;
      if (existsSync(oldest)) unlinkSync(oldest);
    } catch {
      /* ignore — unrecoverable, just keep logging */
    }
    for (let i = keepFiles - 1; i >= 1; i--) {
      const src = `${logPath}.${i}`;
      const dst = `${logPath}.${i + 1}`;
      try {
        if (existsSync(src)) renameSync(src, dst);
      } catch {
        /* ignore */
      }
    }
    try {
      renameSync(logPath, `${logPath}.1`);
    } catch {
      /* ignore — next append will just keep growing */
    }
  };

  const api = {
    get level() {
      return level;
    },
    setLevel(next: LogLevelName) {
      level = next;
      minIdx = Math.max(0, ORDER.indexOf(next));
    },
    /** Reconfigure size-based rotation at runtime (e.g. after a settings reload). */
    setRotation(opts: LoggerRotationOptions): void {
      maxBytes = normalizeMaxBytes(opts.maxBytes);
      keepFiles = normalizeKeepFiles(opts.keepFiles);
    },
    getRotation(): { maxBytes: number; keepFiles: number } {
      return { maxBytes, keepFiles };
    },
    getRecentLines(maxLines = RING_CAPACITY): string[] {
      const cap = Math.max(1, Math.min(maxLines, RING_CAPACITY));
      if (ring.length <= cap) return [...ring];
      return ring.slice(-cap);
    },
    /**
     * Wipe the log on the user's request from the WebUI: truncate the live file
     * (so the next `appendFileSync` keeps writing without us holding a stale
     * inode), drop all rotated backups, and clear the in-memory ring so the Log
     * page does not keep showing old lines.
     *
     * Returns a small report so the HTTP route can surface what was reset.
     */
    clear(): { truncated: boolean; removedBackups: number; ringEntriesCleared: number } {
      const ringEntriesCleared = ring.length;
      ring.length = 0;
      let truncated = false;
      try {
        if (existsSync(logPath)) {
          truncateSync(logPath, 0);
          truncated = true;
        }
      } catch {
        /* ignore */
      }
      let removedBackups = 0;
      for (let i = 1; i <= MAX_KEEP_FILES; i++) {
        const p = `${logPath}.${i}`;
        try {
          if (existsSync(p)) {
            unlinkSync(p);
            removedBackups++;
          }
        } catch {
          /* ignore */
        }
      }
      return { truncated, removedBackups, ringEntriesCleared };
    },
    log(lvl: LogLevelName, msg: string, meta?: Record<string, unknown>) {
      const i = ORDER.indexOf(lvl);
      if (i > minIdx) return;
      const extra = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
      const plain = `${new Date().toISOString()} [${lvl.toUpperCase()}] ${msg}${extra}`;
      pushRing(plain);
      try {
        ensureDir();
        rotateIfNeeded(plain.length + 1);
        appendFileSync(logPath, `${plain}\n`);
      } catch {
        /* ignore disk errors */
      }
      if (lvl === "error") console.error(`[maveoconnect] ${msg}`, meta ?? "");
      else if (i <= ORDER.indexOf("warn")) console.error(`[maveoconnect] ${plain}`);
    },
    error(msg: string, meta?: Record<string, unknown>) {
      api.log("error", msg, meta);
    },
    warn(msg: string, meta?: Record<string, unknown>) {
      api.log("warn", msg, meta);
    },
    info(msg: string, meta?: Record<string, unknown>) {
      api.log("info", msg, meta);
    },
    debug(msg: string, meta?: Record<string, unknown>) {
      api.log("debug", msg, meta);
    },
  };
  return api;
}

function normalizeMaxBytes(v: number | undefined): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return DEFAULT_MAX_BYTES;
  return Math.max(MIN_MAX_BYTES, Math.floor(v));
}

function normalizeKeepFiles(v: number | undefined): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return DEFAULT_KEEP_FILES;
  return Math.min(MAX_KEEP_FILES, Math.max(0, Math.floor(v)));
}

export type Logger = RingBufferedLogger;
