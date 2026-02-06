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

let sentryCache: SentryLike | null | undefined;
let sentryLoading: Promise<SentryLike | null> | null = null;

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

function getActiveStore(): UnknownRecord | null {
  const store = Context.getInstance().getStore();
  if (!store || typeof store !== "object") return null;
  return store as UnknownRecord;
}

function pickFirstValue(store: UnknownRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (key in store) return store[key];
  }
  return undefined;
}

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

function setTag(scope: SentryScopeLike, key: string, value: unknown) {
  if (!scope.setTag) return;
  const stringValue = toTagValue(value);
  if (!stringValue) return;
  scope.setTag(key, truncateString(stringValue, 256));
}

function setExtra(
  scope: SentryScopeLike,
  key: string,
  value: unknown,
  maxSize: number
) {
  if (!scope.setExtra) return;
  scope.setExtra(key, limitSize(value, maxSize));
}

function isPlainObject(value: unknown): value is UnknownRecord {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

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

function normalizeRedactPath(path: string, extraName: string): string[] {
  const parts = path.split(".").filter(Boolean);
  if (parts[0] === extraName) parts.shift();
  if (parts[0] === DEFAULT_EXTRA_NAME) parts.shift();
  return parts;
}

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

function limitSize(value: unknown, maxSize: number): unknown {
  const safeMax = maxSize > 0 ? maxSize : DEFAULT_MAX_EXTRA_SIZE;
  const serialized = safeSerialize(value);
  if (serialized.length <= safeMax) return value;
  return truncateString(serialized, safeMax, true);
}

function safeSerialize(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function truncateString(value: string, maxSize: number, addSuffix = false): string {
  if (value.length <= maxSize) return value;
  const suffix = addSuffix ? TRUNCATED_SUFFIX : "";
  const available = Math.max(0, maxSize - suffix.length);
  return `${value.slice(0, available)}${suffix}`;
}

function normalizeKeyMapping(mapping: SentryKeyMapping): { key: string; name: string } {
  if (typeof mapping === "string") return { key: mapping, name: mapping };
  return { key: mapping.key, name: mapping.name ?? mapping.key };
}

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

  const id =
    (userObject ? pickFirstValue(userObject, idKeys) : undefined) ??
    pickFirstValue(store, ["userId", "user_id"]);
  const username = userObject ? pickFirstValue(userObject, usernameKeys) : undefined;
  const email = userObject ? pickFirstValue(userObject, emailKeys) : undefined;

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

function applyRequestTags(scope: SentryScopeLike, request?: RequestLike) {
  if (!request) return;
  if (request.method) setTag(scope, "method", request.method);
  const url = request.originalUrl ?? request.url;
  if (url) setTag(scope, "url", url);
  const route = request.route?.path;
  if (route) setTag(scope, "route", route);
}

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
    const redacted = applyRedaction(
      cloned,
      options.redactKeys ?? [],
      extraName
    );
    setExtra(scope, extraName, redacted, maxExtraSize);
  }
}

export async function initSentryWithAsyncContext(
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

export async function bindAsyncContextToSentryScope(
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

export async function captureExceptionWithContext(
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

export function sentryAsyncContextExpressMiddleware(
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

export function sentryErrorHandler(
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
