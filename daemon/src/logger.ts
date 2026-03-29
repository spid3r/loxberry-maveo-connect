import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { LogLevelName } from "./settings.js";

const ORDER: LogLevelName[] = ["error", "warn", "info", "debug"];

export function createLogger(level: LogLevelName, logPath: string) {
  const minIdx = Math.max(0, ORDER.indexOf(level));

  const ensureDir = () => {
    const d = dirname(logPath);
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  };

  return {
    level,
    log(lvl: LogLevelName, msg: string, meta?: Record<string, unknown>) {
      const i = ORDER.indexOf(lvl);
      if (i > minIdx) return;
      const extra = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
      const line = `${new Date().toISOString()} [${lvl.toUpperCase()}] ${msg}${extra}\n`;
      try {
        ensureDir();
        appendFileSync(logPath, line);
      } catch {
        // ignore disk errors for logging
      }
      if (lvl === "error") console.error(`[maveoconnect] ${msg}`, meta ?? "");
      else if (i <= ORDER.indexOf("warn")) console.error(`[maveoconnect] ${line.trimEnd()}`);
    },
    error(msg: string, meta?: Record<string, unknown>) {
      this.log("error", msg, meta);
    },
    warn(msg: string, meta?: Record<string, unknown>) {
      this.log("warn", msg, meta);
    },
    info(msg: string, meta?: Record<string, unknown>) {
      this.log("info", msg, meta);
    },
    debug(msg: string, meta?: Record<string, unknown>) {
      this.log("debug", msg, meta);
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;
