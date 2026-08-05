type LogLevel = "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

function serializeError(err: unknown) {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { message: String(err) };
}

/**
 * Minimal structured logger for production ops (JSON lines).
 * Prefer this over bare console.* on critical paths so logs are greppable.
 */
export function log(level: LogLevel, message: string, fields?: LogFields) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    service: process.env.APP_NAME || "dailyflow",
    ...fields,
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (message: string, fields?: LogFields) => log("info", message, fields),
  warn: (message: string, fields?: LogFields) => log("warn", message, fields),
  error: (message: string, fields?: LogFields & { err?: unknown }) => {
    const { err, ...rest } = fields ?? {};
    log("error", message, err !== undefined ? { ...rest, err: serializeError(err) } : rest);
  },
};
