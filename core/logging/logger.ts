import os from "node:os";
import { Context, type ContextStore } from "../context";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export type LogData = Record<string, unknown>;

export type SerializedError = {
  name?: string;
  message?: string;
  stack?: string;
  cause?: unknown;
  details?: unknown;
};

export type LogEntry = {
  level: LogLevel;
  levelValue: number;
  message?: string;
  data?: LogData;
  error?: SerializedError;
  timestamp?: string;
  duration_ms?: number;
} & Record<string, unknown>;

export type Transport = (entry: LogEntry) => void;

export type LoggerOptions = {
  level?: LogLevel;
  name?: string;
  bindings?: LogData;
  context?: boolean;
  contextKey?: string;
  contextKeys?: string[];
  redactDefaults?: boolean;
  redactFieldNames?: string[];
  redactKeys?: string[];
  redactPlaceholder?: string;
  timestamp?: boolean;
  timeFn?: () => Date;
  sampleRate?: number;
  includePid?: boolean;
  includeHostname?: boolean;
  transport?: Transport;
  transports?: Transport[];
  format?: "json" | "pretty";
  colors?: boolean;
};

export type LoggerChildOptions = Omit<LoggerOptions, "bindings">;

export type ConsoleTransportOptions = {
  format?: "json" | "pretty";
  colors?: boolean;
  stderrLevels?: LogLevel[];
  stream?: NodeJS.WritableStream;
};

const LEVEL_VALUES: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

const DEFAULT_REDACT_PLACEHOLDER = "[REDACTED]";
const DEFAULT_REDACT_FIELDS = [
  "password",
  "pass",
  "pwd",
  "secret",
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "authorization",
  "cookie",
  "set_cookie",
  "session",
  "sessionid",
  "api_key",
  "apikey",
  "x_api_key",
  "client_secret",
  "private_key",
  "signature",
  "jwt",
  "bearer",
  "csrf",
  "xsrf",
];

const DEFAULT_STDERR_LEVELS: LogLevel[] = ["error", "fatal"];

const COLOR_RESET = "\x1b[0m";
const COLORS: Record<LogLevel, string> = {
  trace: "\x1b[90m",
  debug: "\x1b[36m",
  info: "\x1b[32m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
  fatal: "\x1b[35m",
};

/**
 * Checks whether a value is a non-array object.
 *
 * @example
 * ```ts
 * const ok = isRecord({ a: 1 }); // true
 * ```
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Normalizes values for safe logging (handles Error, bigint, Map, Set, cycles).
 *
 * @example
 * ```ts
 * const safe = normalizeValue(new Error("boom"));
 * ```
 */
function normalizeValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "object" && value !== null) {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
  }

  if (value instanceof Error) {
    return serializeError(value);
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "function") {
    return `[Function ${value.name || "anonymous"}]`;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Map) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of value.entries()) {
      out[String(key)] = normalizeValue(item, seen);
    }
    return out;
  }

  if (value instanceof Set) {
    return Array.from(value).map((item) => normalizeValue(item, seen));
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item, seen));
  }

  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = normalizeValue(item, seen);
    }
    return out;
  }

  return value;
}

/**
 * Serializes errors into a structured format for log entries.
 *
 * @example
 * ```ts
 * const serialized = serializeError(new Error("boom"));
 * ```
 */
function serializeError(error: unknown): SerializedError | undefined {
  if (!error) return undefined;

  if (error instanceof Error) {
    const serialized: SerializedError = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };

    if ("cause" in error && error.cause !== undefined) {
      serialized.cause = normalizeValue(error.cause);
    }

    return serialized;
  }

  if (typeof error === "string") {
    return { message: error };
  }

  return {
    message: "Non-Error value thrown",
    details: normalizeValue(error),
  };
}

/**
 * Safe JSON stringify that handles cycles and bigint values.
 *
 * @example
 * ```ts
 * const json = safeJsonStringify({ ok: true });
 * ```
 */
function safeJsonStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === "bigint") return item.toString();
    if (typeof item === "object" && item !== null) {
      if (seen.has(item)) return "[Circular]";
      seen.add(item);
    }
    return item;
  });
}

/**
 * Normalizes a key for redaction comparison.
 *
 * @example
 * ```ts
 * normalizeRedactionKey("Authorization"); // "authorization"
 * ```
 */
function normalizeRedactionKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Builds a set of normalized keys for field-name redaction.
 *
 * @example
 * ```ts
 * const keys = buildRedactionKeySet(["token"], true);
 * ```
 */
function buildRedactionKeySet(
  fields: string[] | undefined,
  includeDefaults: boolean
): Set<string> {
  const combined = [
    ...(includeDefaults ? DEFAULT_REDACT_FIELDS : []),
    ...(fields ?? []),
  ];
  const set = new Set<string>();
  for (const entry of combined) {
    const normalized = normalizeRedactionKey(entry);
    if (normalized) set.add(normalized);
  }
  return set;
}

/**
 * Redacts values by matching key names across an object graph.
 *
 * @example
 * ```ts
 * applyKeyNameRedaction(entry, new Set(["password"]), "[REDACTED]");
 * ```
 */
function applyKeyNameRedaction(
  value: unknown,
  keySet: Set<string>,
  placeholder: string
): void {
  if (!keySet.size) return;
  if (!value || typeof value !== "object") return;

  const seen = new WeakSet<object>();
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (seen.has(node as object)) return;
    seen.add(node as object);

    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }

    const record = node as Record<string, unknown>;
    for (const [key, item] of Object.entries(record)) {
      if (keySet.has(normalizeRedactionKey(key))) {
        record[key] = placeholder;
      } else if (item && typeof item === "object") {
        visit(item);
      }
    }
  };

  visit(value);
}

/**
 * Redacts values using explicit dot-paths.
 *
 * @example
 * ```ts
 * applyRedaction(entry, ["data.token"], "[REDACTED]");
 * ```
 */
function applyRedaction(
  value: unknown,
  paths: string[] | undefined,
  placeholder: string
): void {
  if (!paths || paths.length === 0) return;
  if (!value || typeof value !== "object") return;

  for (const path of paths) {
    const parts = path.split(".").filter(Boolean);
    if (parts.length === 0) continue;
    redactPath(value as Record<string, unknown>, parts, placeholder);
  }
}

/**
 * Redacts a specific path inside a record or array.
 *
 * @example
 * ```ts
 * redactPath(entry, ["data", "token"], "[REDACTED]");
 * ```
 */
function redactPath(
  target: Record<string, unknown> | unknown[],
  parts: string[],
  placeholder: string
): void {
  if (parts.length === 0) return;
  const [head, ...tail] = parts;

  if (head === "*") {
    if (Array.isArray(target)) {
      if (tail.length === 0) {
        for (let i = 0; i < target.length; i += 1) {
          target[i] = placeholder;
        }
        return;
      }

      for (const item of target) {
        if (typeof item === "object" && item !== null) {
          redactPath(item as Record<string, unknown>, tail, placeholder);
        }
      }
      return;
    }

    if (tail.length === 0) {
      for (const key of Object.keys(target)) {
        target[key] = placeholder;
      }
      return;
    }

    for (const value of Object.values(target)) {
      if (typeof value === "object" && value !== null) {
        redactPath(value as Record<string, unknown>, tail, placeholder);
      }
    }
    return;
  }

  if (tail.length === 0) {
    if (Array.isArray(target)) {
      const index = Number(head);
      if (!Number.isInteger(index)) return;
      if (index >= 0 && index < target.length) {
        target[index] = placeholder;
      }
      return;
    }

    target[head] = placeholder;
    return;
  }

  const next = Array.isArray(target)
    ? (Number.isInteger(Number(head)) ? target[Number(head)] : undefined)
    : (target as Record<string, unknown>)[head];

  if (next && typeof next === "object") {
    redactPath(next as Record<string, unknown>, tail, placeholder);
  }
}

/**
 * Picks a subset of context keys from the store.
 *
 * @example
 * ```ts
 * const ctx = pickContext(store, ["requestId"]);
 * ```
 */
function pickContext(
  store: ContextStore,
  keys: string[] | undefined
): ContextStore {
  const snapshot = normalizeValue(store) as ContextStore;
  if (!keys || keys.length === 0) {
    return snapshot;
  }

  const picked: ContextStore = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(snapshot, key)) {
      picked[key] = snapshot[key];
    }
  }
  return picked;
}

/**
 * Formats a log entry into a human-readable string.
 *
 * @example
 * ```ts
 * const line = formatPretty(entry, true);
 * ```
 */
function formatPretty(entry: LogEntry, useColors: boolean): string {
  const timestamp = entry.timestamp ? `${entry.timestamp} ` : "";
  const level = entry.level.toUpperCase();
  const levelLabel = useColors
    ? `${COLORS[entry.level]}${level}${COLOR_RESET}`
    : level;
  const name = entry.logger ? ` ${entry.logger}` : "";
  const message = entry.message ? ` ${entry.message}` : "";

  const meta: Record<string, unknown> = { ...entry };
  delete meta.level;
  delete meta.levelValue;
  delete meta.timestamp;
  delete meta.message;

  const metaKeys = Object.keys(meta);
  const metaString = metaKeys.length ? ` ${safeJsonStringify(meta)}` : "";

  return `${timestamp}${levelLabel}${name}${message}${metaString}`.trimEnd();
}

/**
 * Normalizes arbitrary data into a structured log payload.
 *
 * @example
 * ```ts
 * const data = normalizeData({ ok: true });
 * ```
 */
function normalizeData(value: unknown): LogData | undefined {
  if (value === undefined) return undefined;
  if (isRecord(value)) return normalizeValue(value) as LogData;
  if (Array.isArray(value)) return { items: normalizeValue(value) } as LogData;
  if (value instanceof Error) return { error: serializeError(value) } as LogData;
  return { value: normalizeValue(value) } as LogData;
}

/**
 * Extracts message, data, and error from logger arguments.
 *
 * @example
 * ```ts
 * const parts = extractParts(["hello", { ok: true }]);
 * ```
 */
function extractParts(args: unknown[]): {
  message?: string;
  data?: LogData;
  error?: SerializedError;
} {
  if (args.length === 0) return {};

  const [first, second, third] = args;

  if (typeof first === "string") {
    if (second instanceof Error) {
      return {
        message: first,
        data: normalizeData(third),
        error: serializeError(second),
      };
    }

    return {
      message: first,
      data: normalizeData(second),
      error: serializeError(third),
    };
  }

  if (first instanceof Error) {
    if (typeof second === "string") {
      return {
        message: second,
        data: normalizeData(third),
        error: serializeError(first),
      };
    }

    return {
      data: normalizeData(second),
      error: serializeError(first),
    };
  }

  const data = normalizeData(first);
  const message = typeof second === "string" ? second : undefined;
  const error =
    second instanceof Error ? serializeError(second) : serializeError(third);
  return {
    message,
    data,
    error,
  };
}

/**
 * Creates a console transport that writes JSON or pretty logs.
 *
 * @example
 * ```ts
 * const transport = createConsoleTransport({ format: "json" });
 * ```
 */
export function createConsoleTransport(
  options: ConsoleTransportOptions = {}
): Transport {
  const format = options.format ?? "pretty";
  const useColors = options.colors ?? format === "pretty";
  const stderrLevels = new Set(options.stderrLevels ?? DEFAULT_STDERR_LEVELS);

  return (entry) => {
    const line =
      format === "json"
        ? safeJsonStringify(entry)
        : formatPretty(entry, useColors);

    const stream =
      options.stream ??
      (stderrLevels.has(entry.level) ? process.stderr : process.stdout);

    stream.write(`${line}\n`);
  };
}

/**
 * Structured logger with context attachment, redaction, sampling, and transports.
 *
 * @example
 * ```ts
 * const logger = new Logger({ name: "api" });
 * logger.info("started");
 * ```
 */
export class Logger {
  private level: LogLevel;
  private readonly name?: string;
  private readonly bindings: LogData;
  private readonly options: Required<
    Pick<
      LoggerOptions,
      | "context"
      | "contextKey"
      | "contextKeys"
      | "redactDefaults"
      | "redactFieldNames"
      | "redactKeys"
      | "redactPlaceholder"
      | "timestamp"
      | "timeFn"
      | "sampleRate"
      | "includePid"
      | "includeHostname"
    >
  >;
  private readonly transports: Transport[];

  /**
   * Creates a new logger instance.
   *
   * @example
   * ```ts
   * const logger = new Logger({ level: "debug" });
   * ```
   */
  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? "info";
    this.name = options.name;
    this.bindings = normalizeData(options.bindings) ?? {};
    this.options = {
      context: options.context ?? true,
      contextKey: options.contextKey ?? "context",
      contextKeys: options.contextKeys ?? [],
      redactDefaults: options.redactDefaults ?? true,
      redactFieldNames: options.redactFieldNames ?? [],
      redactKeys: options.redactKeys ?? [],
      redactPlaceholder: options.redactPlaceholder ?? DEFAULT_REDACT_PLACEHOLDER,
      timestamp: options.timestamp ?? true,
      timeFn: options.timeFn ?? (() => new Date()),
      sampleRate: options.sampleRate ?? 1,
      includePid: options.includePid ?? true,
      includeHostname: options.includeHostname ?? false,
    };

    const transports = options.transports ??
      (options.transport ? [options.transport] : undefined);

    if (transports && transports.length > 0) {
      this.transports = transports;
    } else {
      this.transports = [
        createConsoleTransport({
          format: options.format ?? "pretty",
          colors: options.colors,
        }),
      ];
    }
  }

  /**
   * Updates the minimum log level.
   *
   * @example
   * ```ts
   * logger.setLevel("warn");
   * ```
   */
  setLevel(level: LogLevel) {
    this.level = level;
  }

  /**
   * Returns the current minimum log level.
   *
   * @example
   * ```ts
   * const level = logger.getLevel();
   * ```
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * Checks whether a given level is enabled.
   *
   * @example
   * ```ts
   * if (logger.isLevelEnabled("debug")) {
   *   // ...
   * }
   * ```
   */
  isLevelEnabled(level: LogLevel): boolean {
    return LEVEL_VALUES[level] >= LEVEL_VALUES[this.level];
  }

  /**
   * Creates a child logger with additional bindings.
   *
   * @example
   * ```ts
   * const child = logger.child({ job: "import" }, { level: "debug" });
   * ```
   */
  child(bindings: LogData, options: LoggerChildOptions = {}): Logger {
    const merged = {
      ...this.bindings,
      ...(normalizeData(bindings) ?? {}),
    };

    const hasCustomTransport =
      options.transports !== undefined || options.transport !== undefined;
    const hasTransportOptions =
      options.format !== undefined || options.colors !== undefined;

    const transports = hasCustomTransport
      ? options.transports ?? (options.transport ? [options.transport] : undefined)
      : hasTransportOptions
        ? undefined
        : this.transports;

    return new Logger({
      level: options.level ?? this.level,
      name: options.name ?? this.name,
      bindings: merged,
      context: options.context ?? this.options.context,
      contextKey: options.contextKey ?? this.options.contextKey,
      contextKeys: options.contextKeys ?? this.options.contextKeys,
      redactDefaults: options.redactDefaults ?? this.options.redactDefaults,
      redactFieldNames: options.redactFieldNames ?? this.options.redactFieldNames,
      redactKeys: options.redactKeys ?? this.options.redactKeys,
      redactPlaceholder: options.redactPlaceholder ?? this.options.redactPlaceholder,
      timestamp: options.timestamp ?? this.options.timestamp,
      timeFn: options.timeFn ?? this.options.timeFn,
      sampleRate: options.sampleRate ?? this.options.sampleRate,
      includePid: options.includePid ?? this.options.includePid,
      includeHostname: options.includeHostname ?? this.options.includeHostname,
      transports,
      format: options.format,
      colors: options.colors,
    });
  }

  /**
   * Runs a callback with a child logger.
   *
   * @example
   * ```ts
   * logger.withBindings({ requestId: "req_1" }, (child) => child.info("ok"));
   * ```
   */
  withBindings<T>(
    bindings: LogData,
    callback: (logger: Logger) => T,
    options?: LoggerChildOptions
  ): T {
    return callback(this.child(bindings, options));
  }

  /**
   * Starts a timer and returns a function that logs the duration.
   *
   * @example
   * ```ts
   * const end = logger.startTimer("debug");
   * // ...work...
   * end("done");
   * ```
   */
  startTimer(level: LogLevel = "info") {
    const start = getHighResolutionTimeMs();
    return (message = "operation completed", data?: LogData) => {
      const duration = getHighResolutionTimeMs() - start;
      this.log(level, message, { ...(data ?? {}), duration_ms: duration });
    };
  }

  /**
   * Logs a message at the provided level.
   *
   * @example
   * ```ts
   * logger.log("info", "user created", { id: 1 });
   * ```
   */
  log(level: LogLevel, ...args: unknown[]) {
    if (!this.isLevelEnabled(level)) return;
    if (this.options.sampleRate < 1 && Math.random() > this.options.sampleRate) {
      return;
    }

    const { message, data, error } = extractParts(args);
    const entry: LogEntry = {
      level,
      levelValue: LEVEL_VALUES[level],
      message,
    };

    if (this.options.timestamp) {
      entry.timestamp = this.options.timeFn().toISOString();
    }

    if (this.name) {
      entry.logger = this.name;
    }

    if (this.options.includePid) {
      entry.pid = process.pid;
    }

    if (this.options.includeHostname) {
      entry.hostname = os.hostname();
    }

    if (data && Object.keys(data).length > 0) {
      entry.data = data;
    }

    if (error) {
      entry.error = error;
    }

    if (Object.keys(this.bindings).length > 0) {
      entry.bindings = normalizeValue(this.bindings) as LogData;
    }

    if (this.options.context) {
      const store = Context.getStore();
      if (store) {
        const context = pickContext(store, this.options.contextKeys);
        entry[this.options.contextKey] = context;
      }
    }

    const redactionKeySet = buildRedactionKeySet(
      this.options.redactFieldNames,
      this.options.redactDefaults
    );
    applyKeyNameRedaction(entry, redactionKeySet, this.options.redactPlaceholder);
    applyRedaction(entry, this.options.redactKeys, this.options.redactPlaceholder);

    for (const transport of this.transports) {
      transport(entry);
    }
  }

  /**
   * Logs a trace message.
   *
   * @example
   * ```ts
   * logger.trace("trace message");
   * ```
   */
  trace(...args: unknown[]) {
    this.log("trace", ...args);
  }

  /**
   * Logs a debug message.
   *
   * @example
   * ```ts
   * logger.debug("debug message");
   * ```
   */
  debug(...args: unknown[]) {
    this.log("debug", ...args);
  }

  /**
   * Logs an info message.
   *
   * @example
   * ```ts
   * logger.info("info message");
   * ```
   */
  info(...args: unknown[]) {
    this.log("info", ...args);
  }

  /**
   * Logs a warning message.
   *
   * @example
   * ```ts
   * logger.warn("warn message");
   * ```
   */
  warn(...args: unknown[]) {
    this.log("warn", ...args);
  }

  /**
   * Logs an error message.
   *
   * @example
   * ```ts
   * logger.error(new Error("boom"));
   * ```
   */
  error(...args: unknown[]) {
    this.log("error", ...args);
  }

  /**
   * Logs a fatal message.
   *
   * @example
   * ```ts
   * logger.fatal("fatal message");
   * ```
   */
  fatal(...args: unknown[]) {
    this.log("fatal", ...args);
  }
}

/**
 * Convenience factory for creating a `Logger`.
 *
 * @example
 * ```ts
 * const logger = createLogger({ name: "api" });
 * ```
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  return new Logger(options);
}

/**
 * Returns a high-resolution timestamp in milliseconds.
 *
 * @example
 * ```ts
 * const start = getHighResolutionTimeMs();
 * ```
 */
function getHighResolutionTimeMs(): number {
  if (typeof process.hrtime?.bigint === "function") {
    return Number(process.hrtime.bigint()) / 1_000_000;
  }
  return Date.now();
}
