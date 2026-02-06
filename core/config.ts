import { createLogger, type LoggerOptions, type LogLevel } from "./logging/logger";

export type LoggerPreset = "development" | "production" | "test";

export type LoggerEnvOptions = {
  env?: NodeJS.ProcessEnv;
  defaults?: LoggerOptions;
  name?: string;
};

const LOG_LEVELS: LogLevel[] = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
];

function pickEnv(env: NodeJS.ProcessEnv, keys: string[]) {
  for (const key of keys) {
    const value = env[key];
    if (value !== undefined && value !== "") return value;
  }
  return undefined;
}

export function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return undefined;
}

export function parseNumberEnv(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

export function parseCsvEnv(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return [];
  return trimmed
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseLogLevelEnv(value: string | undefined): LogLevel | undefined {
  if (!value) return undefined;
  let normalized = value.trim().toLowerCase();
  if (normalized === "warning") normalized = "warn";
  if (normalized === "err") normalized = "error";
  if (LOG_LEVELS.includes(normalized as LogLevel)) {
    return normalized as LogLevel;
  }
  return undefined;
}

export function parseLogFormatEnv(
  value: string | undefined
): "json" | "pretty" | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "json" || normalized === "pretty") return normalized;
  return undefined;
}

export function parseLoggerPresetEnv(
  value: string | undefined
): LoggerPreset | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "development") return "development";
  if (normalized === "production") return "production";
  if (normalized === "test") return "test";
  return undefined;
}

export function loggerPreset(preset: LoggerPreset): LoggerOptions {
  switch (preset) {
    case "development":
      return {
        level: "debug",
        format: "pretty",
        colors: true,
        context: true,
        includePid: true,
        includeHostname: false,
        timestamp: true,
      };
    case "production":
      return {
        level: "info",
        format: "json",
        colors: false,
        context: true,
        includePid: true,
        includeHostname: true,
        timestamp: true,
      };
    case "test":
      return {
        level: "warn",
        format: "json",
        colors: false,
        context: false,
        includePid: false,
        includeHostname: false,
        timestamp: false,
      };
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function createLoggerFromEnv(options: LoggerEnvOptions = {}) {
  const env = options.env ?? process.env;
  const presetName = parseLoggerPresetEnv(pickEnv(env, ["LOG_PRESET"]));
  const base = presetName ? loggerPreset(presetName) : {};
  const defaults = { ...base, ...(options.defaults ?? {}) };

  const resolved: LoggerOptions = { ...defaults };

  const name = options.name ?? pickEnv(env, ["LOG_NAME", "LOGGER_NAME"]);
  if (name) resolved.name = name;

  const level = parseLogLevelEnv(
    pickEnv(env, ["LOG_LEVEL", "LOGLEVEL", "LOGGER_LEVEL"])
  );
  if (level) resolved.level = level;

  const format = parseLogFormatEnv(pickEnv(env, ["LOG_FORMAT"]));
  if (format) resolved.format = format;

  const colors = parseBooleanEnv(pickEnv(env, ["LOG_COLORS", "LOG_COLOURS"]));
  if (colors !== undefined) resolved.colors = colors;

  const context = parseBooleanEnv(pickEnv(env, ["LOG_CONTEXT"]));
  if (context !== undefined) resolved.context = context;

  const contextKey = pickEnv(env, ["LOG_CONTEXT_KEY"]);
  if (contextKey) resolved.contextKey = contextKey;

  const contextKeys = parseCsvEnv(pickEnv(env, ["LOG_CONTEXT_KEYS"]));
  if (contextKeys !== undefined) resolved.contextKeys = contextKeys;

  const redactKeys = parseCsvEnv(pickEnv(env, ["LOG_REDACT_KEYS"]));
  if (redactKeys !== undefined) resolved.redactKeys = redactKeys;

  const sampleRate = parseNumberEnv(pickEnv(env, ["LOG_SAMPLE_RATE"]));
  if (sampleRate !== undefined) {
    resolved.sampleRate = clamp(sampleRate, 0, 1);
  }

  const includePid = parseBooleanEnv(pickEnv(env, ["LOG_INCLUDE_PID"]));
  if (includePid !== undefined) resolved.includePid = includePid;

  const includeHostname = parseBooleanEnv(
    pickEnv(env, ["LOG_INCLUDE_HOSTNAME"])
  );
  if (includeHostname !== undefined) resolved.includeHostname = includeHostname;

  const timestamp = parseBooleanEnv(pickEnv(env, ["LOG_TIMESTAMP"]));
  if (timestamp !== undefined) resolved.timestamp = timestamp;

  return createLogger(resolved);
}
