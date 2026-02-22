import { createLogger, type LoggerOptions, type LogLevel } from "./logging/logger";

export type LoggerPreset = "development" | "production" | "test";

export type LoggerEnvWarning = {
  key: string;
  value: string;
  reason: string;
};

export type LoggerEnvOptions = {
  env?: NodeJS.ProcessEnv;
  defaults?: LoggerOptions;
  name?: string;
  onWarning?: (warning: LoggerEnvWarning) => void;
};

export type LoggerEnvResolution = {
  options: LoggerOptions;
  warnings: LoggerEnvWarning[];
};

const LOG_LEVELS: LogLevel[] = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
];

const LOG_LEVEL_NUMBERS: Record<number, LogLevel> = {
  10: "trace",
  20: "debug",
  30: "info",
  40: "warn",
  50: "error",
  60: "fatal",
};

type EnvEntry = { key: string; value: string };

/**
 * Picks the first non-empty environment value from a list of keys.
 *
 * @example
 * ```ts
 * const value = pickEnv(process.env, ["LOG_LEVEL", "LOGGER_LEVEL"]);
 * ```
 */
function pickEnv(env: NodeJS.ProcessEnv, keys: string[]) {
  return pickEnvEntry(env, keys)?.value;
}

/**
 * Picks the first non-empty environment entry from a list of keys.
 *
 * @example
 * ```ts
 * const entry = pickEnvEntry(process.env, ["LOG_LEVEL", "LOGGER_LEVEL"]);
 * ```
 */
function pickEnvEntry(env: NodeJS.ProcessEnv, keys: string[]): EnvEntry | undefined {
  for (const key of keys) {
    const value = env[key];
    if (value !== undefined && value !== "") return { key, value };
  }
  return undefined;
}

/**
 * Parses a boolean-like env value.
 *
 * @example
 * ```ts
 * parseBooleanEnv("true"); // true
 * parseBooleanEnv("0"); // false
 * ```
 */
export function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return undefined;
}

/**
 * Parses a number-like env value.
 *
 * @example
 * ```ts
 * parseNumberEnv("0.25"); // 0.25
 * ```
 */
export function parseNumberEnv(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

function isIntegerString(value: string): boolean {
  return /^[0-9]+$/.test(value);
}

function parseSampleRateEnv(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  let raw = trimmed;
  let isPercent = false;
  if (trimmed.endsWith("%")) {
    isPercent = true;
    raw = trimmed.slice(0, -1).trim();
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return undefined;
  if (isPercent) return parsed / 100;
  if (parsed > 1 && parsed <= 100 && isIntegerString(raw)) {
    return parsed / 100;
  }
  return parsed;
}

/**
 * Parses a comma-separated env value into an array.
 *
 * @example
 * ```ts
 * parseCsvEnv("a, b, c"); // ["a", "b", "c"]
 * ```
 */
export function parseCsvEnv(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return [];
  return trimmed
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseJsonArrayEnv(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (!trimmed.startsWith("[")) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return undefined;
    return parsed.map((item) => String(item).trim()).filter(Boolean);
  } catch {
    return undefined;
  }
}

function parseListEnv(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return [];
  const dedupe = (items: string[]) => {
    const seen = new Set<string>();
    const output: string[] = [];
    for (const item of items) {
      const normalized = item.trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      output.push(normalized);
    }
    return output;
  };
  if (trimmed.startsWith("[")) {
    const parsed = parseJsonArrayEnv(value);
    return parsed ? dedupe(parsed) : parsed;
  }
  const parsed = parseCsvEnv(value);
  return parsed ? dedupe(parsed) : parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonObjectEnv(
  value: string | undefined
): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return {};
  if (!trimmed.startsWith("{")) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    if (!isRecord(parsed)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function coercePrimitive(value: string): string | number | boolean {
  const normalized = value.trim();
  if (!normalized) return "";
  const lower = normalized.toLowerCase();
  if (lower === "true") return true;
  if (lower === "false") return false;
  const asNumber = Number(normalized);
  if (Number.isFinite(asNumber)) return asNumber;
  return normalized;
}

function parseKeyValueEnv(value: string): Record<string, unknown> | undefined {
  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length === 0) return {};

  const parsed: Record<string, unknown> = {};
  for (const entry of entries) {
    const separatorIndex = entry.indexOf("=");
    if (separatorIndex <= 0) return undefined;
    const key = entry.slice(0, separatorIndex).trim();
    const rawValue = entry.slice(separatorIndex + 1).trim();
    if (!key) return undefined;
    parsed[key] = coercePrimitive(rawValue);
  }

  return parsed;
}

function parseBindingsEnv(
  value: string | undefined
): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith("{")) {
    return parseJsonObjectEnv(value);
  }
  return parseKeyValueEnv(trimmed);
}

/**
 * Parses a log level from an env value.
 *
 * @example
 * ```ts
 * parseLogLevelEnv("warning"); // "warn"
 * ```
 */
export function parseLogLevelEnv(
  value: string | undefined
): LogLevel | undefined {
  if (!value) return undefined;
  let normalized = value.trim().toLowerCase();
  if (normalized === "warning") normalized = "warn";
  if (normalized === "err") normalized = "error";
  if (LOG_LEVELS.includes(normalized as LogLevel)) {
    return normalized as LogLevel;
  }
  const numericLevel = Number(normalized);
  if (Number.isInteger(numericLevel) && LOG_LEVEL_NUMBERS[numericLevel]) {
    return LOG_LEVEL_NUMBERS[numericLevel];
  }
  return undefined;
}

/**
 * Parses a log format from an env value.
 *
 * @example
 * ```ts
 * parseLogFormatEnv("json"); // "json"
 * ```
 */
export function parseLogFormatEnv(
  value: string | undefined
): "json" | "pretty" | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "json" || normalized === "pretty") return normalized;
  return undefined;
}

/**
 * Parses a logger preset from an env value.
 *
 * @example
 * ```ts
 * parseLoggerPresetEnv("production"); // "production"
 * ```
 */
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

/**
 * Returns a predefined logger configuration.
 *
 * @example
 * ```ts
 * const options = loggerPreset("development");
 * ```
 */
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

/**
 * Clamps a numeric value between a minimum and maximum.
 *
 * @example
 * ```ts
 * clamp(10, 0, 5); // 5
 * ```
 */
function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function warnInvalid(
  warnings: LoggerEnvWarning[],
  entry: EnvEntry | undefined,
  reason: string
) {
  if (!entry) return;
  warnings.push({ key: entry.key, value: entry.value, reason });
}

/**
 * Resolves logger options from environment variables and defaults.
 *
 * @example
 * ```ts
 * const { options, warnings } = resolveLoggerEnv({ env: process.env });
 * ```
 */
export function resolveLoggerEnv(
  options: LoggerEnvOptions = {}
): LoggerEnvResolution {
  const env = options.env ?? process.env;
  const warnings: LoggerEnvWarning[] = [];

  const presetEntry = pickEnvEntry(env, ["LOG_PRESET", "LOGGER_PRESET"]);
  const presetName = parseLoggerPresetEnv(presetEntry?.value);
  if (presetEntry && !presetName) {
    warnInvalid(
      warnings,
      presetEntry,
      "Invalid preset. Use development, production, or test."
    );
  }

  const base = presetName ? loggerPreset(presetName) : {};
  const defaults = { ...base, ...(options.defaults ?? {}) };
  const resolved: LoggerOptions = { ...defaults };

  const name = options.name ?? pickEnv(env, ["LOG_NAME", "LOGGER_NAME"]);
  if (name) resolved.name = name;

  const bindingsEntry = pickEnvEntry(env, ["LOG_BINDINGS", "LOGGER_BINDINGS"]);
  const bindings = parseBindingsEnv(bindingsEntry?.value);
  if (bindingsEntry && bindings === undefined) {
    warnInvalid(
      warnings,
      bindingsEntry,
      "Invalid bindings. Use JSON object or key=value pairs."
    );
  }
  if (bindings !== undefined) {
    resolved.bindings = { ...(resolved.bindings ?? {}), ...bindings };
  }

  const levelEntry = pickEnvEntry(env, [
    "LOG_LEVEL",
    "LOGLEVEL",
    "LOGGER_LEVEL",
    "LOGGER_LOGLEVEL",
  ]);
  const level = parseLogLevelEnv(levelEntry?.value);
  if (levelEntry && !level) {
    warnInvalid(
      warnings,
      levelEntry,
      "Invalid log level. Use trace, debug, info, warn, error, or fatal."
    );
  }
  if (level) resolved.level = level;

  const formatEntry = pickEnvEntry(env, ["LOG_FORMAT", "LOGGER_FORMAT"]);
  const format = parseLogFormatEnv(formatEntry?.value);
  if (formatEntry && !format) {
    warnInvalid(warnings, formatEntry, "Invalid format. Use json or pretty.");
  }
  if (format) resolved.format = format;

  const colorsEntry = pickEnvEntry(env, [
    "LOG_COLORS",
    "LOG_COLOURS",
    "LOGGER_COLORS",
    "LOGGER_COLOURS",
  ]);
  const colors = parseBooleanEnv(colorsEntry?.value);
  if (colorsEntry && colors === undefined) {
    warnInvalid(
      warnings,
      colorsEntry,
      "Invalid boolean. Use true/false, 1/0, yes/no, on/off."
    );
  }
  if (colors !== undefined) resolved.colors = colors;

  const contextEntry = pickEnvEntry(env, ["LOG_CONTEXT", "LOGGER_CONTEXT"]);
  const context = parseBooleanEnv(contextEntry?.value);
  if (contextEntry && context === undefined) {
    warnInvalid(
      warnings,
      contextEntry,
      "Invalid boolean. Use true/false, 1/0, yes/no, on/off."
    );
  }
  if (context !== undefined) resolved.context = context;

  const contextKey = pickEnv(env, ["LOG_CONTEXT_KEY", "LOGGER_CONTEXT_KEY"]);
  if (contextKey) resolved.contextKey = contextKey;

  const contextKeysEntry = pickEnvEntry(env, [
    "LOG_CONTEXT_KEYS",
    "LOGGER_CONTEXT_KEYS",
  ]);
  const contextKeys = parseListEnv(contextKeysEntry?.value);
  if (contextKeysEntry && contextKeys === undefined) {
    warnInvalid(
      warnings,
      contextKeysEntry,
      "Invalid list. Use comma-separated values or JSON array."
    );
  }
  if (contextKeys !== undefined) resolved.contextKeys = contextKeys;

  const redactKeysEntry = pickEnvEntry(env, [
    "LOG_REDACT_KEYS",
    "LOGGER_REDACT_KEYS",
  ]);
  const redactKeys = parseListEnv(redactKeysEntry?.value);
  if (redactKeysEntry && redactKeys === undefined) {
    warnInvalid(
      warnings,
      redactKeysEntry,
      "Invalid list. Use comma-separated values or JSON array."
    );
  }
  if (redactKeys !== undefined) resolved.redactKeys = redactKeys;

  const redactDefaultsEntry = pickEnvEntry(env, [
    "LOG_REDACT_DEFAULTS",
    "LOGGER_REDACT_DEFAULTS",
  ]);
  const redactDefaults = parseBooleanEnv(redactDefaultsEntry?.value);
  if (redactDefaultsEntry && redactDefaults === undefined) {
    warnInvalid(
      warnings,
      redactDefaultsEntry,
      "Invalid boolean. Use true/false, 1/0, yes/no, on/off."
    );
  }
  if (redactDefaults !== undefined) resolved.redactDefaults = redactDefaults;

  const redactFieldNamesEntry = pickEnvEntry(env, [
    "LOG_REDACT_FIELDS",
    "LOGGER_REDACT_FIELDS",
  ]);
  const redactFieldNames = parseListEnv(redactFieldNamesEntry?.value);
  if (redactFieldNamesEntry && redactFieldNames === undefined) {
    warnInvalid(
      warnings,
      redactFieldNamesEntry,
      "Invalid list. Use comma-separated values or JSON array."
    );
  }
  if (redactFieldNames !== undefined) {
    resolved.redactFieldNames = redactFieldNames;
  }

  const redactPlaceholder = pickEnv(env, [
    "LOG_REDACT_PLACEHOLDER",
    "LOGGER_REDACT_PLACEHOLDER",
  ]);
  if (redactPlaceholder) resolved.redactPlaceholder = redactPlaceholder;

  const sampleRateEntry = pickEnvEntry(env, [
    "LOG_SAMPLE_RATE",
    "LOGGER_SAMPLE_RATE",
  ]);
  const sampleRate = parseSampleRateEnv(sampleRateEntry?.value);
  if (sampleRateEntry && sampleRate === undefined) {
    warnInvalid(
      warnings,
      sampleRateEntry,
      "Invalid number. Use 0..1 or percent (25 or 25%)."
    );
  }
  if (sampleRate !== undefined) {
    const clamped = clamp(sampleRate, 0, 1);
    if (sampleRateEntry && clamped !== sampleRate) {
      warnInvalid(
        warnings,
        sampleRateEntry,
        `Out of range (0..1). Clamped to ${clamped}.`
      );
    }
    resolved.sampleRate = clamped;
  }

  const includePidEntry = pickEnvEntry(env, [
    "LOG_INCLUDE_PID",
    "LOGGER_INCLUDE_PID",
  ]);
  const includePid = parseBooleanEnv(includePidEntry?.value);
  if (includePidEntry && includePid === undefined) {
    warnInvalid(
      warnings,
      includePidEntry,
      "Invalid boolean. Use true/false, 1/0, yes/no, on/off."
    );
  }
  if (includePid !== undefined) resolved.includePid = includePid;

  const includeHostnameEntry = pickEnvEntry(env, [
    "LOG_INCLUDE_HOSTNAME",
    "LOGGER_INCLUDE_HOSTNAME",
  ]);
  const includeHostname = parseBooleanEnv(includeHostnameEntry?.value);
  if (includeHostnameEntry && includeHostname === undefined) {
    warnInvalid(
      warnings,
      includeHostnameEntry,
      "Invalid boolean. Use true/false, 1/0, yes/no, on/off."
    );
  }
  if (includeHostname !== undefined) resolved.includeHostname = includeHostname;

  const timestampEntry = pickEnvEntry(env, ["LOG_TIMESTAMP", "LOGGER_TIMESTAMP"]);
  const timestamp = parseBooleanEnv(timestampEntry?.value);
  if (timestampEntry && timestamp === undefined) {
    warnInvalid(
      warnings,
      timestampEntry,
      "Invalid boolean. Use true/false, 1/0, yes/no, on/off."
    );
  }
  if (timestamp !== undefined) resolved.timestamp = timestamp;

  return { options: resolved, warnings };
}

/**
 * Creates a logger based on environment variables and optional defaults.
 *
 * @example
 * ```ts
 * const logger = createLoggerFromEnv({ name: "api" });
 * ```
 */
export function createLoggerFromEnv(options: LoggerEnvOptions = {}) {
  const resolution = resolveLoggerEnv(options);
  if (options.onWarning) {
    for (const warning of resolution.warnings) {
      options.onWarning(warning);
    }
  }
  return createLogger(resolution.options);
}
