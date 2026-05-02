import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { LogLevelName } from "./settings.js";

const ORDER: LogLevelName[] = ["error", "warn", "info", "debug"];

const RING_CAPACITY = 520;

export type RingBufferedLogger = ReturnType<typeof createLogger>;

export function createLogger(initialLevel: LogLevelName, logPath: string) {
  let minIdx = Math.max(0, ORDER.indexOf(initialLevel));
  let level: LogLevelName = initialLevel;
  const ring: string[] = [];

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

  const api = {
    get level() {
      return level;
    },
    setLevel(next: LogLevelName) {
      level = next;
      minIdx = Math.max(0, ORDER.indexOf(next));
    },
    getRecentLines(maxLines = RING_CAPACITY): string[] {
      const cap = Math.max(1, Math.min(maxLines, RING_CAPACITY));
      if (ring.length <= cap) return [...ring];
      return ring.slice(-cap);
    },
    log(lvl: LogLevelName, msg: string, meta?: Record<string, unknown>) {
      const i = ORDER.indexOf(lvl);
      if (i > minIdx) return;
      const extra = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
      const plain = `${new Date().toISOString()} [${lvl.toUpperCase()}] ${msg}${extra}`;
      pushRing(plain);
      try {
        ensureDir();
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

export type Logger = RingBufferedLogger;
