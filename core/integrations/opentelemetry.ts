import { Context } from "../context";
import type * as http from "node:http";
import {
  createAsyncContextExpressMiddleware,
  type AsyncContextExpressOptions,
} from "./express";
import {
  createAsyncContextFastifyHook,
  type AsyncContextFastifyOptions,
  type FastifyHook,
  type FastifyReplyLike,
  type FastifyRequestLike,
} from "./fastify";
import {
  createAsyncContextKoaMiddleware,
  type AsyncContextKoaOptions,
  type KoaContextLike,
  type KoaMiddleware,
} from "./koa";
import {
  createAsyncContextNextHandler,
  type AsyncContextNextOptions,
  type NextApiHandler,
} from "./next";

type UnknownRecord = Record<string, unknown>;

export type OpenTelemetrySpanContext = {
  traceId?: string;
  spanId?: string;
  traceFlags?: number;
  isRemote?: boolean;
};

export type OpenTelemetrySpanLike = {
  end?: (endTime?: unknown) => void;
  recordException?: (error: unknown, time?: unknown) => void;
  setStatus?: (status: { code?: number; message?: string }) => void;
  setAttribute?: (key: string, value: unknown) => void;
  setAttributes?: (attributes: Record<string, unknown>) => void;
  addEvent?: (name: string, attributes?: Record<string, unknown>, time?: unknown) => void;
  spanContext?: () => OpenTelemetrySpanContext;
  updateName?: (name: string) => void;
};

export type OpenTelemetryTracerLike = {
  startSpan: (
    name: string,
    options?: Record<string, unknown>,
    context?: OpenTelemetryContextLike
  ) => OpenTelemetrySpanLike;
};

export type OpenTelemetryContextLike = unknown;

export type OpenTelemetryContextApi = {
  active: () => OpenTelemetryContextLike;
  with: <T>(context: OpenTelemetryContextLike, fn: () => T) => T;
};

export type OpenTelemetryTraceApi = {
  getTracer: (name?: string, version?: string) => OpenTelemetryTracerLike;
  getSpan?: (context?: OpenTelemetryContextLike) => OpenTelemetrySpanLike | undefined;
  setSpan?: (
    context: OpenTelemetryContextLike,
    span: OpenTelemetrySpanLike
  ) => OpenTelemetryContextLike;
};

export type TextMapGetterLike = {
  keys: (carrier: unknown) => string[];
  get: (carrier: unknown, key: string) => undefined | string | string[];
};

export type TextMapSetterLike = {
  set: (carrier: unknown, key: string, value: string) => void;
};

export type OpenTelemetryBaggageEntry = {
  value: string;
  metadata?: string;
};

export type OpenTelemetryBaggageLike = {
  getAllEntries?: () => Record<string, OpenTelemetryBaggageEntry>;
  getEntry?: (key: string) => OpenTelemetryBaggageEntry | undefined;
};

export type OpenTelemetryPropagationApi = {
  extract: (
    context: OpenTelemetryContextLike,
    carrier: unknown,
    getter?: TextMapGetterLike
  ) => OpenTelemetryContextLike;
  inject: (
    context: OpenTelemetryContextLike,
    carrier: unknown,
    setter?: TextMapSetterLike
  ) => void;
  getBaggage?: (context: OpenTelemetryContextLike) => OpenTelemetryBaggageLike | undefined;
  setBaggage?: (
    context: OpenTelemetryContextLike,
    baggage: OpenTelemetryBaggageLike
  ) => OpenTelemetryContextLike;
  createBaggage?: (entries?: Record<string, OpenTelemetryBaggageEntry>) => OpenTelemetryBaggageLike;
};

export type OpenTelemetryApi = {
  context?: OpenTelemetryContextApi;
  trace?: OpenTelemetryTraceApi;
  propagation?: OpenTelemetryPropagationApi;
  diag?: {
    warn?: (message: string) => void;
    error?: (message: string) => void;
    info?: (message: string) => void;
    debug?: (message: string) => void;
  };
};

export type OpenTelemetrySpanSummary = {
  provider: "opentelemetry";
  name: string;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  kind?: number;
  status?: { code?: number; message?: string };
  durationMs: number;
  startedAt: number;
  endedAt: number;
  attributes?: Record<string, unknown>;
  error?: { name?: string; message: string };
};

export type OpenTelemetrySpanRecordOptions = {
  key?: string;
  mode?: "append" | "overwrite";
};

export type OpenTelemetrySpanOptions = {
  api?: OpenTelemetryApi;
  tracerName?: string;
  tracerVersion?: string;
  parentContext?: OpenTelemetryContextLike;
  kind?: number;
  attributes?: Record<string, unknown>;
  startTime?: number;
  includeContextAttributes?: boolean;
  contextAttributeKeys?: string[];
  contextAttributePrefix?: string;
  maxAttributeValueLength?: number;
  recordSummary?: boolean;
  summaryKey?: string;
  summaryMode?: "append" | "overwrite";
  includeSummaryAttributes?: boolean;
  now?: () => number;
  recordException?: boolean;
  setStatusOnError?: boolean;
  errorStatusCode?: number;
  errorStatusMessage?: string;
};

export type OpenTelemetryBaggageFromContextOptions = {
  api?: OpenTelemetryApi;
  context?: OpenTelemetryContextLike;
  contextKeys: string[];
  baggagePrefix?: string;
  maxValueLength?: number;
  mode?: "merge" | "overwrite";
};

export type OpenTelemetryContextFromBaggageOptions = {
  api?: OpenTelemetryApi;
  context?: OpenTelemetryContextLike;
  baggageKeys?: string[];
  baggagePrefix?: string;
  targetKeyPrefix?: string;
  mode?: "merge" | "overwrite";
};

export type OpenTelemetryHeaderPropagationOptions = {
  api?: OpenTelemetryApi;
  context?: OpenTelemetryContextLike;
  getter?: TextMapGetterLike;
  setter?: TextMapSetterLike;
};

export type OpenTelemetryHttpSpanOptions<Req = unknown, Res = unknown> = {
  api?: OpenTelemetryApi;
  tracerName?: string;
  tracerVersion?: string;
  spanName?: (req: Req) => string;
  spanKind?: number;
  attributes?: (req: Req, res: Res) => Record<string, unknown>;
  extractContext?: boolean;
  recordSummary?: boolean;
  summaryKey?: string;
  summaryMode?: "append" | "overwrite";
  includeContextAttributes?: boolean;
  contextAttributeKeys?: string[];
  contextAttributePrefix?: string;
  maxAttributeValueLength?: number;
  now?: () => number;
  recordException?: boolean;
  setStatusOnError?: boolean;
  errorStatusCode?: number;
  autoImport?: boolean;
};

export type AsyncContextExpressOpenTelemetryOptions = AsyncContextExpressOptions & {
  otel?: OpenTelemetryHttpSpanOptions;
};

export type AsyncContextFastifyOpenTelemetryOptions<
  Req = FastifyRequestLike,
  Reply = FastifyReplyLike
> = AsyncContextFastifyOptions<Req, Reply> & {
  otel?: OpenTelemetryHttpSpanOptions<Req, Reply>;
};

export type AsyncContextKoaOpenTelemetryOptions<Ctx = KoaContextLike> =
  AsyncContextKoaOptions<Ctx> & {
    otel?: OpenTelemetryHttpSpanOptions<Ctx, unknown>;
  };

export type AsyncContextNextOpenTelemetryOptions<Req, Res> =
  AsyncContextNextOptions<Req, Res> & {
    otel?: OpenTelemetryHttpSpanOptions<Req, Res>;
  };

const DEFAULT_CONTEXT_KEY = "otel";
const DEFAULT_TRACER_NAME = "async-context";
const DEFAULT_MAX_STRING_LENGTH = 1000;
const DEFAULT_ERROR_STATUS_CODE = 2;
const DEFAULT_HTTP_SPAN_KIND = 1;
const TRUNCATED_SUFFIX = "...[truncated]";

let otelCache: OpenTelemetryApi | null | undefined;
let otelLoading: Promise<OpenTelemetryApi | null> | null = null;

export async function getOpenTelemetryApi(): Promise<OpenTelemetryApi | null> {
  if (otelCache !== undefined) return otelCache;
  if (otelLoading) return otelLoading;

  otelLoading = (async () => {
    try {
      const moduleId = "@opentelemetry/api";
      const mod = await import(moduleId);
      const resolved = (mod as { default?: OpenTelemetryApi }).default ?? mod;
      return resolved ?? null;
    } catch (error) {
      if (isModuleNotFound(error)) return null;
      throw error;
    }
  })();

  otelCache = await otelLoading;
  return otelCache;
}

export function getCachedOpenTelemetryApi(): OpenTelemetryApi | null | undefined {
  return otelCache;
}

export function recordOpenTelemetrySpan(
  summary: OpenTelemetrySpanSummary,
  options: OpenTelemetrySpanRecordOptions = {}
): void {
  const store = Context.getStore<UnknownRecord>();
  if (!store) return;

  const key = options.key ?? DEFAULT_CONTEXT_KEY;
  const mode = options.mode ?? "append";

  if (mode === "overwrite") {
    store[key] = summary;
    return;
  }

  const existing = store[key];
  if (Array.isArray(existing)) {
    existing.push(summary);
    return;
  }

  if (existing === undefined) {
    store[key] = [summary];
    return;
  }

  store[key] = [existing, summary];
}

export async function withOpenTelemetrySpan<T>(
  name: string,
  callback: () => T | Promise<T>,
  options: OpenTelemetrySpanOptions = {}
): Promise<T> {
  const api = options.api ?? (await getOpenTelemetryApi());
  if (!api?.trace?.getTracer) {
    return await Promise.resolve(callback());
  }

  const tracer = api.trace.getTracer(
    options.tracerName ?? DEFAULT_TRACER_NAME,
    options.tracerVersion
  );

  const now = options.now ?? Date.now;
  const startedAt = now();
  const attributes = sanitizeAttributes(
    options.attributes,
    options.maxAttributeValueLength ?? DEFAULT_MAX_STRING_LENGTH
  );

  const spanOptions: Record<string, unknown> = {
    ...(options.kind !== undefined ? { kind: options.kind } : {}),
    ...(options.startTime !== undefined ? { startTime: options.startTime } : {}),
    ...(attributes ? { attributes } : {}),
  };

  const parentContext = options.parentContext ?? api.context?.active?.();
  const span = startSpan(tracer, name, spanOptions, parentContext);

  if (!span) {
    return await Promise.resolve(callback());
  }

  const recordedAttributes: Record<string, unknown> = {};
  if (attributes) {
    applyAttributes(span, attributes, recordedAttributes);
  }

  if (options.includeContextAttributes && options.contextAttributeKeys?.length) {
    const contextAttrs = buildContextAttributes(
      options.contextAttributeKeys,
      options.contextAttributePrefix,
      options.maxAttributeValueLength ?? DEFAULT_MAX_STRING_LENGTH
    );
    if (contextAttrs) {
      applyAttributes(span, contextAttrs, recordedAttributes);
    }
  }

  const runWithSpan = <TResult>(fn: () => TResult): TResult => {
    if (api.context?.with && api.trace?.setSpan && parentContext !== undefined) {
      const ctxWithSpan = api.trace.setSpan(parentContext, span);
      return api.context.with(ctxWithSpan, fn);
    }
    return fn();
  };

  const finalize = (error?: unknown) => {
    const endedAt = now();
    const durationMs = Math.max(0, endedAt - startedAt);

    let status: { code?: number; message?: string } | undefined;
    if (error && options.setStatusOnError !== false && span.setStatus) {
      status = {
        code: options.errorStatusCode ?? DEFAULT_ERROR_STATUS_CODE,
        message: options.errorStatusMessage ?? normalizeErrorMessage(error),
      };
      span.setStatus(status);
    }

    if (error && options.recordException !== false && span.recordException) {
      span.recordException(error);
    }

    if (span.end) {
      span.end();
    }

    if (options.recordSummary === false) return;

    const spanContext = safeSpanContext(span);
    const parentSpanId = getParentSpanId(api, parentContext);
    const summary: OpenTelemetrySpanSummary = {
      provider: "opentelemetry",
      name,
      traceId: spanContext?.traceId,
      spanId: spanContext?.spanId,
      parentSpanId,
      kind: options.kind,
      status,
      durationMs,
      startedAt,
      endedAt,
      error: error ? normalizeError(error) : undefined,
    };

    if (options.includeSummaryAttributes !== false &&
      Object.keys(recordedAttributes).length > 0) {
      summary.attributes = { ...recordedAttributes };
    }

    recordOpenTelemetrySpan(summary, {
      key: options.summaryKey,
      mode: options.summaryMode,
    });
  };

  try {
    const result = runWithSpan(callback);
    if (isPromiseLike(result)) {
      return (result
        .then((value) => {
          finalize();
          return value;
        })
        .catch((error) => {
          finalize(error);
          throw error;
        })) as Promise<T>;
    }
    finalize();
    return result as T;
  } catch (error) {
    finalize(error);
    throw error;
  }
}

export function getActiveOpenTelemetrySpanContext(
  api?: OpenTelemetryApi
): OpenTelemetrySpanContext | undefined {
  const resolved = api ?? getCachedOpenTelemetryApi();
  if (!resolved?.trace?.getSpan || !resolved?.context?.active) return undefined;
  const span = resolved.trace.getSpan(resolved.context.active());
  return span ? safeSpanContext(span) : undefined;
}

export function setOpenTelemetryBaggageFromContext(
  options: OpenTelemetryBaggageFromContextOptions
): OpenTelemetryContextLike | undefined {
  const api = options.api ?? getCachedOpenTelemetryApi();
  if (!api?.propagation?.setBaggage || !api.propagation.createBaggage) return;

  const store = Context.getStore<UnknownRecord>();
  if (!store) return;

  const entries: Record<string, OpenTelemetryBaggageEntry> = {};
  const prefix = options.baggagePrefix ?? "";
  const maxValueLength = options.maxValueLength ?? 256;

  for (const key of options.contextKeys) {
    if (!Object.prototype.hasOwnProperty.call(store, key)) continue;
    const value = toBaggageValue(store[key], maxValueLength);
    if (!value) continue;
    entries[`${prefix}${key}`] = { value };
  }

  if (Object.keys(entries).length === 0) return;

  const baseContext = options.context ?? api.context?.active?.();
  if (!baseContext) return;
  let mergedEntries = entries;

  if (options.mode !== "overwrite" && api.propagation.getBaggage && baseContext) {
    const existing = api.propagation.getBaggage(baseContext);
    if (existing?.getAllEntries) {
      mergedEntries = { ...existing.getAllEntries(), ...entries };
    }
  }

  const baggage = api.propagation.createBaggage(mergedEntries);
  return api.propagation.setBaggage(baseContext as OpenTelemetryContextLike, baggage);
}

export function mergeContextFromOpenTelemetryBaggage(
  options: OpenTelemetryContextFromBaggageOptions
): void {
  const api = options.api ?? getCachedOpenTelemetryApi();
  if (!api?.propagation?.getBaggage) return;

  const store = Context.getStore<UnknownRecord>();
  if (!store) return;

  const context = options.context ?? api.context?.active?.();
  if (!context) return;

  const baggage = api.propagation.getBaggage(context);
  if (!baggage?.getAllEntries) return;

  const entries = baggage.getAllEntries();
  const keysFilter = options.baggageKeys;
  const prefix = options.baggagePrefix ?? "";
  const targetPrefix = options.targetKeyPrefix ?? "";
  const overwrite = options.mode === "overwrite";

  for (const [key, entry] of Object.entries(entries)) {
    let effectiveKey = key;
    if (prefix) {
      if (!key.startsWith(prefix)) continue;
      effectiveKey = key.slice(prefix.length);
    }

    if (keysFilter && !keysFilter.includes(key) && !keysFilter.includes(effectiveKey)) {
      continue;
    }

    let targetKey = effectiveKey;
    if (targetPrefix) targetKey = `${targetPrefix}${targetKey}`;
    if (!overwrite && Object.prototype.hasOwnProperty.call(store, targetKey)) {
      continue;
    }

    store[targetKey] = entry?.value;
  }
}

export function extractOpenTelemetryContextFromHeaders(
  headers: Record<string, unknown> | undefined,
  options: OpenTelemetryHeaderPropagationOptions = {}
): OpenTelemetryContextLike | undefined {
  const api = options.api ?? getCachedOpenTelemetryApi();
  if (!api?.propagation?.extract) return undefined;

  const carrier = headers ?? {};
  const baseContext = options.context ?? api.context?.active?.();
  if (!baseContext) return undefined;
  const getter = options.getter ?? DEFAULT_TEXT_MAP_GETTER;

  return api.propagation.extract(baseContext as OpenTelemetryContextLike, carrier, getter);
}

export function injectOpenTelemetryContextToHeaders(
  headers: Record<string, unknown>,
  options: OpenTelemetryHeaderPropagationOptions = {}
): void {
  const api = options.api ?? getCachedOpenTelemetryApi();
  if (!api?.propagation?.inject) return;

  const baseContext = options.context ?? api.context?.active?.();
  if (!baseContext) return;
  const setter = options.setter ?? DEFAULT_TEXT_MAP_SETTER;

  api.propagation.inject(baseContext, headers, setter);
}

export function createAsyncContextExpressOpenTelemetryMiddleware(
  options: AsyncContextExpressOpenTelemetryOptions = {}
) {
  const { otel, ...asyncOptions } = options;
  const base = createAsyncContextExpressMiddleware(asyncOptions);

  return function asyncContextExpressOpenTelemetryMiddleware(
    req: { method?: string; url?: string; originalUrl?: string; headers?: Record<string, unknown>; route?: { path?: string } },
    res: { statusCode?: number; statusMessage?: string; on?: (event: string, listener: () => void) => void; once?: (event: string, listener: () => void) => void },
    next: (err?: unknown) => void
  ) {
    return base(req as any, res as any, () => {
      const controller = createHttpSpanController(
        req,
        res,
        {
          method: req.method,
          url: req.originalUrl ?? req.url,
          route: req.route?.path,
          headers: req.headers,
        },
        otel,
        () => res.statusCode
      );

      if (!controller) return next();

      const { runWithSpan, recordError, end } = controller;
      let ended = false;
      const finalize = () => {
        if (ended) return;
        ended = true;
        end();
      };

      const onFinish = () => finalize();
      if (res.once) {
        res.once("finish", onFinish);
        res.once("close", onFinish);
      } else if (res.on) {
        res.on("finish", onFinish);
        res.on("close", onFinish);
      }

      const wrappedNext = (err?: unknown) => {
        if (err) recordError(err);
        return next(err);
      };

      return runWithSpan(() => {
        try {
          return wrappedNext();
        } catch (error) {
          recordError(error);
          finalize();
          throw error;
        }
      });
    });
  };
}

export function createAsyncContextFastifyOpenTelemetryHook<
  Req = FastifyRequestLike,
  Reply = FastifyReplyLike
>(options: AsyncContextFastifyOpenTelemetryOptions<Req, Reply> = {}): FastifyHook<Req, Reply> {
  const { otel, ...asyncOptions } = options;
  const base = createAsyncContextFastifyHook(asyncOptions);

  return function asyncContextFastifyOpenTelemetryHook(
    request: Req,
    reply: Reply,
    done?: (err?: Error) => void
  ) {
    return base(request, reply, (err?: Error) => {
      if (err) {
        if (done) return done(err);
        return;
      }

      const rawRequest = ((request as any)?.raw ?? request) as {
        method?: string;
        url?: string;
        headers?: Record<string, unknown>;
      };
      const rawReply = ((reply as any)?.raw ?? reply) as {
        statusCode?: number;
        on?: (event: string, listener: () => void) => void;
        once?: (event: string, listener: () => void) => void;
      };

      const controller = createHttpSpanController(request, reply, {
        method: rawRequest?.method ?? (request as any)?.method,
        url: rawRequest?.url ?? (request as any)?.url,
        route: (request as any)?.routerPath ?? (request as any)?.routeOptions?.url,
        headers: rawRequest?.headers ?? (request as any)?.headers,
      }, otel, () => rawReply?.statusCode ?? (reply as any)?.statusCode);

      if (!controller) {
        if (done) return done();
        return;
      }

      const { runWithSpan, recordError, end } = controller;
      let ended = false;
      const finalize = () => {
        if (ended) return;
        ended = true;
        end();
      };

      const onFinish = () => finalize();
      if (rawReply?.once) {
        rawReply.once("finish", onFinish);
        rawReply.once("close", onFinish);
      } else if (rawReply?.on) {
        rawReply.on("finish", onFinish);
        rawReply.on("close", onFinish);
      }

      const wrappedDone = (error?: Error) => {
        if (error) recordError(error);
        if (done) return done(error);
      };

      return runWithSpan(() => {
        try {
          return wrappedDone();
        } catch (error) {
          recordError(error);
          finalize();
          throw error as Error;
        }
      });
    });
  };
}

export function createAsyncContextKoaOpenTelemetryMiddleware<Ctx = KoaContextLike>(
  options: AsyncContextKoaOpenTelemetryOptions<Ctx> = {}
): KoaMiddleware<Ctx> {
  const { otel, ...asyncOptions } = options;
  const base = createAsyncContextKoaMiddleware(asyncOptions);

  return async function asyncContextKoaOpenTelemetryMiddleware(
    ctx: Ctx,
    next: () => Promise<unknown>
  ) {
    return base(ctx, async () => {
      const requestLike = (ctx as any).request ?? (ctx as any).req ?? {};
      const controller = createHttpSpanController(
        ctx,
        ctx as any,
        {
          method: requestLike?.method,
          url: requestLike?.url,
          route: (ctx as any)?._matchedRoute ?? (ctx as any)?.routerPath,
          headers: requestLike?.headers,
        },
        otel,
        () => (ctx as any)?.status ?? (ctx as any)?.response?.status ?? (ctx as any)?.res?.statusCode
      );

      if (!controller) return next();

      const { runWithSpan, recordError, end } = controller;
      try {
        return await runWithSpan(() => next());
      } catch (error) {
        recordError(error);
        throw error;
      } finally {
        end();
      }
    });
  };
}

export function createAsyncContextNextOpenTelemetryHandler<
  Req extends http.IncomingMessage,
  Res extends http.ServerResponse
>(
  handler: NextApiHandler<Req, Res>,
  options: AsyncContextNextOpenTelemetryOptions<Req, Res> = {}
): NextApiHandler<Req, Res> {
  const { otel, ...asyncOptions } = options;

  return createAsyncContextNextHandler(async (req: Req, res: Res) => {
    const controller = createHttpSpanController(
      req,
      res,
      {
        method: req.method,
        url: req.url,
        route: undefined,
        headers: req.headers,
      },
      otel,
      () => res.statusCode
    );

    if (!controller) {
      return handler(req, res);
    }

    const { runWithSpan, recordError, end } = controller;
    let ended = false;
    const finalize = () => {
      if (ended) return;
      ended = true;
      end();
    };

    const onFinish = () => finalize();
    if (res.once) {
      res.once("finish", onFinish);
      res.once("close", onFinish);
    } else if (res.on) {
      res.on("finish", onFinish);
      res.on("close", onFinish);
    }

    try {
      return await runWithSpan(() => handler(req, res));
    } catch (error) {
      recordError(error);
      throw error;
    } finally {
      finalize();
    }
  }, asyncOptions);
}

type HttpRequestInfo = {
  method?: string;
  url?: string;
  route?: string;
  headers?: Record<string, unknown>;
};

type HttpSpanController = {
  runWithSpan: <T>(fn: () => T) => T;
  recordError: (error: unknown) => void;
  end: () => void;
};

function createHttpSpanController<Req, Res>(
  req: Req,
  res: Res,
  info: HttpRequestInfo,
  options?: OpenTelemetryHttpSpanOptions<Req, Res>,
  getStatusCode?: () => number | undefined
): HttpSpanController | null {
  const resolvedOptions = options ?? {};
  const api = resolveOpenTelemetryApi(resolvedOptions);
  if (!api?.trace?.getTracer) return null;

  const tracer = api.trace.getTracer(
    resolvedOptions.tracerName ?? DEFAULT_TRACER_NAME,
    resolvedOptions.tracerVersion
  );

  const now = resolvedOptions.now ?? Date.now;
  const startedAt = now();

  const baseAttributes = buildHttpAttributes(info);
  const customAttributes = resolvedOptions.attributes
    ? resolvedOptions.attributes(req, res)
    : undefined;

  const mergedAttributes: Record<string, unknown> = {
    ...baseAttributes,
    ...(customAttributes ?? {}),
  };

  const contextAttributes = resolvedOptions.includeContextAttributes &&
    resolvedOptions.contextAttributeKeys?.length
    ? buildContextAttributes(
        resolvedOptions.contextAttributeKeys,
        resolvedOptions.contextAttributePrefix,
        resolvedOptions.maxAttributeValueLength ?? DEFAULT_MAX_STRING_LENGTH
      )
    : undefined;

  if (contextAttributes) {
    Object.assign(mergedAttributes, contextAttributes);
  }

  const attributes = sanitizeAttributes(
    mergedAttributes,
    resolvedOptions.maxAttributeValueLength ?? DEFAULT_MAX_STRING_LENGTH
  );

  const spanOptions: Record<string, unknown> = {
    kind: resolvedOptions.spanKind ?? DEFAULT_HTTP_SPAN_KIND,
    ...(attributes ? { attributes } : {}),
  };

  const baseContext = api.context?.active?.();
  const parentContext = resolvedOptions.extractContext === false
    ? baseContext
    : extractOpenTelemetryContextFromHeaders(info.headers, {
        api,
        context: baseContext,
      }) ?? baseContext;

  const spanName = resolvedOptions.spanName?.(req) ??
    buildDefaultSpanName(info.method, info.route, info.url);

  const span = startSpan(tracer, spanName, spanOptions, parentContext);
  if (!span) return null;

  const recordedAttributes: Record<string, unknown> = {};
  if (attributes) {
    applyAttributes(span, attributes, recordedAttributes);
  }

  let recordedError: unknown;
  let status: { code?: number; message?: string } | undefined;
  let ended = false;

  const recordError = (error: unknown) => {
    recordedError = error;
    if (resolvedOptions.recordException !== false && span.recordException) {
      span.recordException(error);
    }
    if (resolvedOptions.setStatusOnError !== false && span.setStatus) {
      status = {
        code: resolvedOptions.errorStatusCode ?? DEFAULT_ERROR_STATUS_CODE,
        message: normalizeErrorMessage(error),
      };
      span.setStatus(status);
    }
  };

  const end = () => {
    if (ended) return;
    ended = true;

    const statusCode = getStatusCode ? getStatusCode() : undefined;
    if (statusCode !== undefined) {
      recordedAttributes["http.status_code"] = statusCode;
      if (span.setAttribute) span.setAttribute("http.status_code", statusCode);
      if (
        statusCode >= 500 &&
        resolvedOptions.setStatusOnError !== false &&
        span.setStatus
      ) {
        status = {
          code: resolvedOptions.errorStatusCode ?? DEFAULT_ERROR_STATUS_CODE,
          message: `HTTP ${statusCode}`,
        };
        span.setStatus(status);
      }
    }

    if (span.end) span.end();

    if (resolvedOptions.recordSummary === false) return;

    const endedAt = now();
    const durationMs = Math.max(0, endedAt - startedAt);
    const spanContext = safeSpanContext(span);
    const parentSpanId = getParentSpanId(api, parentContext);
    const summary: OpenTelemetrySpanSummary = {
      provider: "opentelemetry",
      name: spanName,
      traceId: spanContext?.traceId,
      spanId: spanContext?.spanId,
      parentSpanId,
      kind: resolvedOptions.spanKind ?? DEFAULT_HTTP_SPAN_KIND,
      status,
      durationMs,
      startedAt,
      endedAt,
      error: recordedError ? normalizeError(recordedError) : undefined,
      attributes: Object.keys(recordedAttributes).length > 0
        ? { ...recordedAttributes }
        : undefined,
    };

    recordOpenTelemetrySpan(summary, {
      key: resolvedOptions.summaryKey,
      mode: resolvedOptions.summaryMode,
    });
  };

  const runWithSpan = <TResult>(fn: () => TResult): TResult => {
    if (api.context?.with && api.trace?.setSpan && parentContext !== undefined) {
      const ctxWithSpan = api.trace.setSpan(parentContext, span);
      return api.context.with(ctxWithSpan, fn);
    }
    return fn();
  };

  return { runWithSpan, recordError, end };
}

function startSpan(
  tracer: OpenTelemetryTracerLike,
  name: string,
  options: Record<string, unknown>,
  context?: OpenTelemetryContextLike
): OpenTelemetrySpanLike | null {
  try {
    if (context !== undefined) {
      return tracer.startSpan(name, options, context);
    }
    return tracer.startSpan(name, options);
  } catch {
    return null;
  }
}

function resolveOpenTelemetryApi(
  options: { api?: OpenTelemetryApi; autoImport?: boolean } = {}
): OpenTelemetryApi | null | undefined {
  if (options.api) return options.api;
  const cached = getCachedOpenTelemetryApi();
  if (cached !== undefined) return cached;
  if (options.autoImport !== false) {
    void getOpenTelemetryApi();
  }
  return cached;
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return !!value && typeof (value as Promise<T>).then === "function";
}

function buildDefaultSpanName(
  method?: string,
  route?: string,
  url?: string
): string {
  const safeMethod = method ?? "HTTP";
  const target = route ?? url ?? "/";
  return `${safeMethod} ${target}`.trim();
}

function buildHttpAttributes(info: HttpRequestInfo) {
  const attributes: Record<string, unknown> = {};
  if (info.method) attributes["http.method"] = info.method;
  if (info.url) attributes["http.url"] = info.url;
  if (info.route) attributes["http.route"] = info.route;
  return attributes;
}

function applyAttributes(
  span: OpenTelemetrySpanLike,
  attributes: Record<string, unknown>,
  recorded: Record<string, unknown>
) {
  if (!attributes || Object.keys(attributes).length === 0) return;
  for (const [key, value] of Object.entries(attributes)) {
    recorded[key] = value;
    if (span.setAttribute) span.setAttribute(key, value);
  }

  if (span.setAttributes) {
    span.setAttributes(attributes);
  }
}

function sanitizeAttributes(
  attributes: Record<string, unknown> | undefined,
  maxStringLength: number
) {
  if (!attributes) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attributes)) {
    const normalized = toAttributeValue(value, maxStringLength);
    if (normalized !== undefined) out[key] = normalized;
  }
  return out;
}

function buildContextAttributes(
  keys: string[],
  prefix = "ctx.",
  maxStringLength: number
) {
  const store = Context.getStore<UnknownRecord>();
  if (!store) return undefined;

  const attributes: Record<string, unknown> = {};
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(store, key)) continue;
    const value = toAttributeValue(store[key], maxStringLength);
    if (value === undefined) continue;
    attributes[`${prefix}${key}`] = value;
  }

  return attributes;
}

function toAttributeValue(value: unknown, maxStringLength: number): unknown {
  if (value === null || value === undefined) return undefined;

  if (typeof value === "string") {
    return truncateString(value, maxStringLength);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint") {
    return truncateString(value.toString(), maxStringLength);
  }

  if (value instanceof Date) {
    return truncateString(value.toISOString(), maxStringLength);
  }

  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => toAttributeValue(item, maxStringLength))
      .filter((item): item is string | number | boolean =>
        typeof item === "string" ||
        typeof item === "number" ||
        typeof item === "boolean"
      );
    return normalized.length > 0 ? normalized : undefined;
  }

  try {
    return truncateString(JSON.stringify(value), maxStringLength);
  } catch {
    return truncateString(String(value), maxStringLength);
  }
}

function truncateString(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const sliceLength = Math.max(0, maxLength - TRUNCATED_SUFFIX.length);
  return `${value.slice(0, sliceLength)}${TRUNCATED_SUFFIX}`;
}

function normalizeError(error: unknown): { name?: string; message: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  if (typeof error === "string") return { message: error };
  if (error && typeof error === "object") {
    const maybe = error as { message?: unknown; name?: unknown };
    const message = typeof maybe.message === "string" ? maybe.message : "Unknown error";
    const name = typeof maybe.name === "string" ? maybe.name : undefined;
    return { name, message };
  }
  return { message: String(error) };
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const maybe = error as { message?: unknown };
    if (typeof maybe.message === "string") return maybe.message;
  }
  return "Unknown error";
}

function safeSpanContext(span: OpenTelemetrySpanLike) {
  if (!span.spanContext) return undefined;
  try {
    return span.spanContext();
  } catch {
    return undefined;
  }
}

function getParentSpanId(
  api: OpenTelemetryApi,
  context?: OpenTelemetryContextLike
): string | undefined {
  if (!context || !api.trace?.getSpan) return undefined;
  const parentSpan = api.trace.getSpan(context);
  const parentContext = parentSpan ? safeSpanContext(parentSpan) : undefined;
  return parentContext?.spanId;
}

function toBaggageValue(value: unknown, maxLength: number): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return truncateString(value, maxLength);
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return truncateString(String(value), maxLength);
  }
  if (value instanceof Date) return truncateString(value.toISOString(), maxLength);
  try {
    return truncateString(JSON.stringify(value), maxLength);
  } catch {
    return truncateString(String(value), maxLength);
  }
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
  ) && message.includes("@opentelemetry/api");
}

const DEFAULT_TEXT_MAP_GETTER: TextMapGetterLike = {
  keys(carrier: unknown): string[] {
    if (!carrier || typeof carrier !== "object") return [];
    return Object.keys(carrier as Record<string, unknown>);
  },
  get(carrier: unknown, key: string): undefined | string | string[] {
    if (!carrier || typeof carrier !== "object") return undefined;
    const record = carrier as Record<string, unknown>;
    const direct = record[key];
    if (typeof direct === "string" || Array.isArray(direct)) return direct;
    const lower = record[key.toLowerCase()];
    if (typeof lower === "string" || Array.isArray(lower)) return lower;
    return undefined;
  },
};

const DEFAULT_TEXT_MAP_SETTER: TextMapSetterLike = {
  set(carrier: unknown, key: string, value: string) {
    if (!carrier || typeof carrier !== "object") return;
    (carrier as Record<string, unknown>)[key] = value;
  },
};
