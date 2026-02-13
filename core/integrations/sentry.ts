import { Context } from "../context";

type UnknownRecord = Record<string, unknown>;

type RequestLike = {
  method?: string;
  url?: string;
  originalUrl?: string;
  route?: { path?: string };
};

type ExpressMiddleware = (
  req: RequestLike,
  res: unknown,
  next: (err?: unknown) => void
) => void;

type ExpressErrorHandler = (
  err: unknown,
  req: RequestLike,
  res: unknown,
  next: (err?: unknown) => void
) => void;

export type SentryScopeLike = {
  setTag?: (key: string, value: string) => void;
  setExtra?: (key: string, value: unknown) => void;
  setUser?: (user: { id?: string; username?: string; email?: string }) => void;
  setContext?: (name: string, context: Record<string, unknown>) => void;
};

export type SentryLike = {
  init?: (options: unknown) => void;
  captureException?: (error: unknown) => string | undefined;
  withScope?: (callback: (scope: SentryScopeLike) => void) => void;
  configureScope?: (callback: (scope: SentryScopeLike) => void) => void;
};

export type SentryKeyMapping = string | { key: string; name?: string };

export type SentryUserMapping = {
  objectKeys?: string[];
  idKeys?: string[];
  usernameKeys?: string[];
  emailKeys?: string[];
};

export type SentryAsyncContextOptions = {
  includeDefaults?: boolean;
  tagKeys?: SentryKeyMapping[];
  extraKeys?: SentryKeyMapping[];
  user?: SentryUserMapping;
  attachStore?: boolean;
  extraName?: string;
  redactKeys?: string[];
  redactFieldNames?: string[];
  redactDefaults?: boolean;
  maxExtraSize?: number;
  request?: RequestLike;
};

export type InitSentryOptions = SentryAsyncContextOptions & {
  sentryInit?: unknown;
};

const DEFAULT_EXTRA_NAME = "async_context";
const DEFAULT_MAX_EXTRA_SIZE = 16 * 1024;
const REDACTED_VALUE = "[REDACTED]";
const TRUNCATED_SUFFIX = "...[truncated]";
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

let sentryCache: SentryLike | null | undefined;
let sentryLoading: Promise<SentryLike | null> | null = null;

/**
 * Lazily imports `@sentry/node` and caches the resolved module.
 *
 * @example
 * ```ts
 * const sentry = await getSentry();
 * ```
 */
async function getSentry(): Promise<SentryLike | null> {
  if (sentryCache !== undefined) return sentryCache;
  if (sentryLoading) return sentryLoading;

  sentryLoading = (async () => {
    try {
      const moduleId = "@sentry/node";
      const mod = await import(moduleId);
      const resolved = (mod as { default?: SentryLike }).default ?? mod;
      return resolved ?? null;
    } catch (error) {
      if (isModuleNotFound(error)) return null;
      throw error;
    }
  })();

  sentryCache = await sentryLoading;
  return sentryCache;
}

/**
 * Detects whether an error represents a missing Sentry module.
 *
 * @example
 * ```ts
 * if (isModuleNotFound(error)) return null;
 * ```
 */
function isModuleNotFound(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  if (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") return true;
  const message = (error as { message?: string }).message;
  if (!message) return false;
  return (
    message.includes("Cannot find module") ||
    message.includes("Cannot find package") ||
    message.includes("Failed to resolve")
  ) && message.includes("@sentry/node");
}

/**
 * Returns the current async context store as a plain object.
 *
 * @example
 * ```ts
 * const store = getActiveStore();
 * ```
 */
function getActiveStore(): UnknownRecord | null {
  const store = Context.getInstance().getStore();
  if (!store || typeof store !== "object") return null;
  return store as UnknownRecord;
}

/**
 * Picks the first value from the store that matches the provided keys.
 *
 * @example
 * ```ts
 * const requestId = pickFirstValue(store, ["requestId", "request_id"]);
 * ```
 */
function pickFirstValue(store: UnknownRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (key in store) return store[key];
  }
  return undefined;
}

/**
 * Normalizes a value into a string suitable for Sentry tags.
 *
 * @example
 * ```ts
 * const tag = toTagValue(123); // "123"
 * ```
 */
function toTagValue(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint")
    return String(value);
  if (value instanceof Date) return value.toISOString();
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Applies a tag to a Sentry scope, if supported.
 *
 * @example
 * ```ts
 * setTag(scope, "tenant_id", "t_123");
 * ```
 */
function setTag(scope: SentryScopeLike, key: string, value: unknown) {
  if (!scope.setTag) return;
  const stringValue = toTagValue(value);
  if (!stringValue) return;
  scope.setTag(key, truncateString(stringValue, 256));
}

/**
 * Applies an extra field to a Sentry scope, respecting size limits.
 *
 * @example
 * ```ts
 * setExtra(scope, "request_id", "req_123", 4096);
 * ```
 */
function setExtra(
  scope: SentryScopeLike,
  key: string,
  value: unknown,
  maxSize: number
) {
  if (!scope.setExtra) return;
  scope.setExtra(key, limitSize(value, maxSize));
}

/**
 * Checks whether a value is a plain object.
 *
 * @example
 * ```ts
 * if (isPlainObject(value)) {
 *   // ...
 * }
 * ```
 */
function isPlainObject(value: unknown): value is UnknownRecord {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Clones a value to a Sentry-safe structure for `extra`.
 *
 * @example
 * ```ts
 * const safe = cloneForExtra(store);
 * ```
 */
function cloneForExtra(
  value: unknown,
  depth = 0,
  seen = new WeakMap<object, unknown>()
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return String(value);

  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error)
    return { name: value.name, message: value.message, stack: value.stack };

  if (seen.has(value)) return "[Circular]";
  if (depth > 6) return "[MaxDepth]";

  if (Array.isArray(value)) {
    const clone: unknown[] = [];
    seen.set(value, clone);
    for (const item of value) {
      clone.push(cloneForExtra(item, depth + 1, seen));
    }
    return clone;
  }

  if (!isPlainObject(value)) return String(value);

  const clone: UnknownRecord = {};
  seen.set(value, clone);
  for (const [key, item] of Object.entries(value)) {
    clone[key] = cloneForExtra(item, depth + 1, seen);
  }
  return clone;
}

/**
 * Normalizes a redaction path relative to a Sentry extra root name.
 *
 * @example
 * ```ts
 * normalizeRedactPath("async_context.token", "async_context");
 * ```
 */
function normalizeRedactPath(path: string, extraName: string): string[] {
  const parts = path.split(".").filter(Boolean);
  if (parts[0] === extraName) parts.shift();
  if (parts[0] === DEFAULT_EXTRA_NAME) parts.shift();
  return parts;
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
 * applyKeyNameRedaction(payload, new Set(["password"]));
 * ```
 */
function applyKeyNameRedaction(
  target: unknown,
  keySet: Set<string>
): unknown {
  if (!keySet.size) return target;
  if (!target || typeof target !== "object") return target;

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

    const record = node as UnknownRecord;
    for (const [key, value] of Object.entries(record)) {
      if (keySet.has(normalizeRedactionKey(key))) {
        record[key] = REDACTED_VALUE;
      } else if (value && typeof value === "object") {
        visit(value);
      }
    }
  };

  visit(target);
  return target;
}

/**
 * Redacts values using explicit dot-paths.
 *
 * @example
 * ```ts
 * applyRedaction(payload, ["user.token"], "async_context");
 * ```
 */
function applyRedaction(target: unknown, paths: string[], extraName: string) {
  if (!paths.length) return target;
  if (!target || typeof target !== "object") return target;

  for (const path of paths) {
    const parts = normalizeRedactPath(path, extraName);
    if (!parts.length) continue;
    redactPath(target as UnknownRecord, parts);
  }

  return target;
}

/**
 * Redacts a specific path inside a record.
 *
 * @example
 * ```ts
 * redactPath(record, ["user", "token"]);
 * ```
 */
function redactPath(target: UnknownRecord, parts: string[]) {
  if (!target || typeof target !== "object") return;
  const [head, ...rest] = parts;
  if (!head) return;
  if (rest.length === 0) {
    if (head in target) target[head] = REDACTED_VALUE;
    return;
  }
  const next = target[head];
  if (next && typeof next === "object") {
    redactPath(next as UnknownRecord, rest);
  }
}

/**
 * Ensures values fit within a byte-size budget for Sentry extras.
 *
 * @example
 * ```ts
 * const safe = limitSize(store, 4096);
 * ```
 */
function limitSize(value: unknown, maxSize: number): unknown {
  const safeMax = maxSize > 0 ? maxSize : DEFAULT_MAX_EXTRA_SIZE;
  const serialized = safeSerialize(value);
  if (serialized.length <= safeMax) return value;
  return truncateString(serialized, safeMax, true);
}

/**
 * Safely serializes a value to JSON, falling back to `String`.
 *
 * @example
 * ```ts
 * const serialized = safeSerialize({ ok: true });
 * ```
 */
function safeSerialize(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Truncates strings to a maximum size and optionally appends a suffix.
 *
 * @example
 * ```ts
 * truncateString("hello", 3); // "hel"
 * ```
 */
function truncateString(value: string, maxSize: number, addSuffix = false): string {
  if (value.length <= maxSize) return value;
  const suffix = addSuffix ? TRUNCATED_SUFFIX : "";
  const available = Math.max(0, maxSize - suffix.length);
  return `${value.slice(0, available)}${suffix}`;
}

/**
 * Normalizes a key mapping to `{ key, name }`.
 *
 * @example
 * ```ts
 * normalizeKeyMapping("tenantId"); // { key: "tenantId", name: "tenantId" }
 * ```
 */
function normalizeKeyMapping(mapping: SentryKeyMapping): { key: string; name: string } {
  if (typeof mapping === "string") return { key: mapping, name: mapping };
  return { key: mapping.key, name: mapping.name ?? mapping.key };
}

/**
 * Resolves a user object for Sentry from the async context store.
 *
 * @example
 * ```ts
 * const user = resolveUser(store, { idKeys: ["userId"] });
 * ```
 */
function resolveUser(store: UnknownRecord, options: SentryUserMapping | undefined) {
  const objectKeys = options?.objectKeys ?? ["user"];
  const userCandidate = pickFirstValue(store, objectKeys);

  const idKeys = options?.idKeys ?? ["id", "userId", "user_id"];
  const usernameKeys = options?.usernameKeys ?? ["username", "user_name", "name"];
  const emailKeys = options?.emailKeys ?? ["email"];

  const userObject =
    userCandidate && typeof userCandidate === "object"
      ? (userCandidate as UnknownRecord)
      : null;

  const rootId = pickFirstValue(store, options?.idKeys ?? ["userId", "user_id"]);
  const id = (userObject ? pickFirstValue(userObject, idKeys) : undefined) ?? rootId;
  const username = userObject
    ? pickFirstValue(userObject, usernameKeys)
    : pickFirstValue(store, usernameKeys);
  const email = userObject
    ? pickFirstValue(userObject, emailKeys)
    : pickFirstValue(store, emailKeys);

  if (!id && !username && !email && userCandidate) {
    return { id: toTagValue(userCandidate) };
  }

  const normalizedId = toTagValue(id);
  const normalizedUsername = toTagValue(username);
  const normalizedEmail = toTagValue(email);

  if (!normalizedId && !normalizedUsername && !normalizedEmail) return null;

  return {
    id: normalizedId,
    username: normalizedUsername,
    email: normalizedEmail,
  };
}

/**
 * Applies request-related tags to a Sentry scope.
 *
 * @example
 * ```ts
 * applyRequestTags(scope, { method: "GET", url: "/health" });
 * ```
 */
function applyRequestTags(scope: SentryScopeLike, request?: RequestLike) {
  if (!request) return;
  if (request.method) setTag(scope, "method", request.method);
  const url = request.originalUrl ?? request.url;
  if (url) setTag(scope, "url", url);
  const route = request.route?.path;
  if (route) setTag(scope, "route", route);
}

/**
 * Applies async context store data to a Sentry scope.
 *
 * @example
 * ```ts
 * applyStoreToScope(scope, store, { includeDefaults: true });
 * ```
 */
function applyStoreToScope(
  scope: SentryScopeLike,
  store: UnknownRecord | null,
  options: SentryAsyncContextOptions
) {
  const includeDefaults = options.includeDefaults !== false;
  const maxExtraSize = options.maxExtraSize ?? DEFAULT_MAX_EXTRA_SIZE;

  applyRequestTags(scope, options.request);

  if (!store) return;

  if (includeDefaults) {
    const requestId = pickFirstValue(store, [
      "requestId",
      "request_id",
      "instance_id",
    ]);
    if (requestId !== undefined) {
      setTag(scope, "request_id", requestId);
      setExtra(scope, "request_id", requestId, maxExtraSize);
    }

    const tenantId = pickFirstValue(store, ["tenantId", "tenant_id"]);
    if (tenantId !== undefined) setTag(scope, "tenant_id", tenantId);

    const user = resolveUser(store, options.user);
    if (user && scope.setUser) scope.setUser(user);
  }

  if (options.tagKeys) {
    for (const mapping of options.tagKeys) {
      const { key, name } = normalizeKeyMapping(mapping);
      if (key in store) setTag(scope, name, store[key]);
    }
  }

  if (options.extraKeys) {
    for (const mapping of options.extraKeys) {
      const { key, name } = normalizeKeyMapping(mapping);
      if (key in store) setExtra(scope, name, store[key], maxExtraSize);
    }
  }

  if (options.attachStore !== false) {
    const extraName = options.extraName ?? DEFAULT_EXTRA_NAME;
    const cloned = cloneForExtra(store);
    const redacted = applyRedaction(cloned, options.redactKeys ?? [], extraName);
    const redactionKeySet = buildRedactionKeySet(
      options.redactFieldNames,
      options.redactDefaults !== false
    );
    applyKeyNameRedaction(redacted, redactionKeySet);
    setExtra(scope, extraName, redacted, maxExtraSize);
  }
}

/**
 * Initializes Sentry and binds the current async context to the scope.
 *
 * @example
 * ```ts
 * await initSentryWithAsyncContext({
 *   sentryInit: { dsn: process.env.SENTRY_DSN },
 * });
 * ```
 */
async function initSentryWithAsyncContext(
  options: InitSentryOptions = {}
): Promise<boolean> {
  const sentry = await getSentry();
  if (!sentry || typeof sentry.init !== "function") return false;

  const {
    includeDefaults,
    tagKeys,
    extraKeys,
    user,
    attachStore,
    extraName,
    redactKeys,
    redactFieldNames,
    redactDefaults,
    maxExtraSize,
    request,
    sentryInit,
    ...initOptions
  } = options;

  sentry.init(sentryInit ?? initOptions);
  await bindAsyncContextToSentryScope({
    includeDefaults,
    tagKeys,
    extraKeys,
    user,
    attachStore,
    extraName,
    redactKeys,
    maxExtraSize,
    request,
  });

  return true;
}

/**
 * Binds the current async context store to the Sentry scope.
 *
 * @example
 * ```ts
 * await bindAsyncContextToSentryScope({ tagKeys: ["tenantId"] });
 * ```
 */
async function bindAsyncContextToSentryScope(
  options: SentryAsyncContextOptions = {}
): Promise<boolean> {
  const sentry = await getSentry();
  if (!sentry) return false;
  const store = getActiveStore();

  if (sentry.configureScope) {
    sentry.configureScope((scope) => {
      applyStoreToScope(scope, store, options);
    });
    return true;
  }

  if (sentry.withScope) {
    sentry.withScope((scope) => {
      applyStoreToScope(scope, store, options);
    });
    return true;
  }

  return false;
}

/**
 * Captures an exception in Sentry, enriching the event with async context.
 *
 * @example
 * ```ts
 * await captureExceptionWithContext(error);
 * ```
 */
async function captureExceptionWithContext(
  error: unknown,
  options: SentryAsyncContextOptions = {}
): Promise<string | null> {
  const sentry = await getSentry();
  if (!sentry || typeof sentry.captureException !== "function") return null;
  const store = getActiveStore();

  if (sentry.withScope) {
    let eventId: string | undefined;
    sentry.withScope((scope) => {
      applyStoreToScope(scope, store, options);
      eventId = sentry.captureException?.(error);
    });
    return eventId ?? null;
  }

  if (sentry.configureScope) {
    sentry.configureScope((scope) => {
      applyStoreToScope(scope, store, options);
    });
  }

  return sentry.captureException(error) ?? null;
}

/**
 * Express middleware that binds async context data to each Sentry scope.
 *
 * @example
 * ```ts
 * app.use(sentryAsyncContextExpressMiddleware());
 * ```
 */
function sentryAsyncContextExpressMiddleware(
  options: SentryAsyncContextOptions = {}
): ExpressMiddleware {
  return async (req, _res, next) => {
    try {
      const sentry = await getSentry();
      if (!sentry || !sentry.withScope) return next();

      sentry.withScope((scope) => {
        applyStoreToScope(scope, getActiveStore(), { ...options, request: req });
        next();
      });
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Express error handler that captures exceptions with async context.
 *
 * @example
 * ```ts
 * app.use(sentryErrorHandler());
 * ```
 */
function sentryErrorHandler(
  options: SentryAsyncContextOptions = {}
): ExpressErrorHandler {
  return async (err, req, _res, next) => {
    try {
      await captureExceptionWithContext(err, { ...options, request: req });
    } finally {
      next(err);
    }
  };
}

export {
  initSentryWithAsyncContext,
  bindAsyncContextToSentryScope,
  captureExceptionWithContext,
  sentryAsyncContextExpressMiddleware,
  sentryErrorHandler,
};
