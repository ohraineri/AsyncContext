# AsyncContext

> Async context propagation and structured logging for Node.js, with first-class framework integrations.

AsyncContext helps you carry contextual data across asynchronous boundaries without passing parameters through every function. It provides a `Context` wrapper around `AsyncLocalStorage`, ready-made middleware for popular frameworks, and a structured logger that automatically includes the active context in every log entry.

## Highlights

- Consistent per-request context without parameter threading.
- Simple, direct API for reading and writing context anywhere in the async flow.
- Observability-ready with correlation IDs, tenant/user data, and tracing metadata.
- Full-featured logger with levels, redaction, sampling, timers, and transports.
- DX-friendly configuration via presets and environment variables.
- Zero runtime dependencies and performance-focused design.

## Installation

```bash
npm i @marceloraineri/async-context
```

## Quick start

```ts
import crypto from "node:crypto";
import { Context } from "@marceloraineri/async-context";

await Context.run({ requestId: crypto.randomUUID() }, async () => {
  Context.addValue("user", { id: 42, name: "Ada" });
  Context.addOptions({ feature: "beta", retry: 2 });

  await Promise.resolve();

  const store = Context.getStore();
  console.log(store?.requestId); // 184fa9a3-f967-4a98-9d8f-57152e7cbe64
  console.log(store?.user); // { id: 42, name: "Ada" }
  console.log(store?.options); // { feature: "beta", retry: 2 }
});
```

## Structured logging

The logger automatically merges the active async context and supports redaction, sampling, timers, and JSON or pretty output.

```ts
import crypto from "node:crypto";
import { Context, createLogger } from "@marceloraineri/async-context";

const logger = createLogger({
  name: "api",
  level: "info",
  contextKey: "ctx",
  redactKeys: ["ctx.token", "data.password"],
});

await Context.run({ requestId: crypto.randomUUID(), token: "secret" }, async () => {
  logger.info("request started", { route: "/ping" });
});
```

By default, common sensitive keys (for example `password`, `token`, `authorization`) are automatically redacted. You can disable this with `redactDefaults: false` or add extra key names with `redactFieldNames`.

### Timers and child loggers

```ts
import { createLogger } from "@marceloraineri/async-context";

const logger = createLogger({ name: "jobs", level: "debug" });
const jobLogger = logger.child({ job: "import-users" });

const end = jobLogger.startTimer("debug");
await Promise.resolve();
end("job completed");

const noisyLogger = logger.child({ job: "debug-import" }, { level: "trace" });
noisyLogger.trace("verbose logging enabled");
```

### JSON output or custom transports

```ts
import { createConsoleTransport, createLogger } from "@marceloraineri/async-context";

const logger = createLogger({
  level: "info",
  transports: [createConsoleTransport({ format: "json" })],
});

logger.info("structured log", { feature: "json" });
```

## OpenAI wrapper

Capture OpenAI call metadata inside the current async context.

```ts
import OpenAI from "openai";
import { Context, withOpenAIContext } from "@marceloraineri/async-context";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

await Context.run({ requestId: "req_123" }, async () => {
  const response = await withOpenAIContext(
    "responses.create",
    { model: "gpt-4o", input: "Hello!" },
    (req) => openai.responses.create(req),
    { includeRequest: true }
  );

  console.log(response.id);
  console.log(Context.getValue("openai"));
});
```

By default, the wrapper appends summaries to the `openai` context key, and only includes safe request fields unless you explicitly allow more keys.

## OpenTelemetry (optional)

Create spans, propagate trace context from headers, and sync baggage with AsyncContext when `@opentelemetry/api` is available.

```ts
import * as otel from "@opentelemetry/api";
import {
  Context,
  createAsyncContextExpressOpenTelemetryMiddleware,
  setOpenTelemetryBaggageFromContext,
  withOpenTelemetrySpan,
} from "@marceloraineri/async-context";

app.use(
  createAsyncContextExpressOpenTelemetryMiddleware({
    otel: {
      api: otel,
      tracerName: "api",
      contextAttributeKeys: ["requestId", "tenantId"],
    },
  })
);

await Context.run({ requestId: "req_1", tenantId: "t_123" }, async () => {
  await withOpenTelemetrySpan(
    "db.query",
    async () => Promise.resolve(),
    { api: otel, attributes: { db: "users" } }
  );

  setOpenTelemetryBaggageFromContext({
    api: otel,
    contextKeys: ["requestId", "tenantId"],
    baggagePrefix: "ctx.",
  });
});
```

## Performance timing

Measure sync or async work and store timing data in the active context.

```ts
import { Context } from "@marceloraineri/async-context";

await Context.run({}, async () => {
  await Context.measure("db.query", async () => {
    await Promise.resolve();
  }, { data: { table: "users" } });

  console.log(Context.getValue("perf"));
});
```

Use `key` or `mode` to control where entries are stored.

```ts
Context.measure("cache.lookup", () => "hit", { key: "performance", mode: "overwrite" });
```

## DX and configuration

Use presets or environment variables to configure logging without code changes.

```ts
import { createLoggerFromEnv, loggerPreset } from "@marceloraineri/async-context";

const logger = createLoggerFromEnv({
  name: "api",
  defaults: loggerPreset("production"),
  onWarning: (warning) => {
    console.warn(`[logger-env] ${warning.key}: ${warning.reason}`, {
      value: warning.value,
    });
  },
});
```

Environment variables:

| Variable | Description | Example |
| --- | --- | --- |
| `LOG_PRESET` | `development`, `production`, or `test` preset | `production` |
| `LOG_LEVEL` | Minimum log level (name or numeric) | `info` |
| `LOG_FORMAT` | `json` or `pretty` | `json` |
| `LOG_COLORS` | Enable ANSI colors | `true` |
| `LOG_CONTEXT` | Attach async context | `true` |
| `LOG_CONTEXT_KEY` | Key name for context | `ctx` |
| `LOG_CONTEXT_KEYS` | Comma-separated or JSON array allowlist | `requestId,tenantId` |
| `LOG_REDACT_KEYS` | Redaction paths (CSV or JSON array) | `ctx.token,data.password` |
| `LOG_REDACT_DEFAULTS` | Enable default sensitive-field redaction | `true` |
| `LOG_REDACT_FIELDS` | Extra sensitive field names (CSV or JSON array) | `accessToken,creditCard` |
| `LOG_REDACT_PLACEHOLDER` | Mask value placeholder | `[REDACTED]` |
| `LOG_SAMPLE_RATE` | 0..1 or percent sampling | `0.25` |
| `LOG_INCLUDE_PID` | Include process id | `true` |
| `LOG_INCLUDE_HOSTNAME` | Include hostname | `false` |
| `LOG_TIMESTAMP` | Include timestamp | `true` |
| `LOG_BINDINGS` | JSON object or key=value pairs added to every log entry | `{"service":"api","version":2}` |
| `LOG_NAME` | Logger name | `api` |

All `LOG_` variables also accept `LOGGER_` aliases (for example `LOGGER_LEVEL`).

## Framework integrations

### Express

`AsyncContextExpresssMiddleware` (with three "s") and `AsyncContextExpressMiddleware` (alias) create a new context per request and seed it with a unique `instance_id`.

```ts
import express from "express";
import { AsyncContextExpressMiddleware, Context } from "@marceloraineri/async-context";

const app = express();
app.use(AsyncContextExpressMiddleware);

app.get("/ping", (_req, res) => {
  const store = Context.getStore();
  res.json({ instanceId: store?.instance_id ?? null });
});

app.listen(3000, () => console.log("API listening on :3000"));
```

If you need a custom request id or seed data, use `createAsyncContextExpressMiddleware`.

```ts
import express from "express";
import { createAsyncContextExpressMiddleware, Context } from "@marceloraineri/async-context";

const app = express();

app.use(
  createAsyncContextExpressMiddleware({
    idKey: "request_id",
    seed: (req) => ({ method: req.method, path: req.url }),
  })
);

app.get("/ping", (_req, res) => {
  const store = Context.getStore();
  res.json({ requestId: store?.request_id ?? null });
});
```

### Fastify

Use the onRequest hook or the convenience registration helper.

```ts
import fastify from "fastify";
import { createAsyncContextFastifyHook, Context } from "@marceloraineri/async-context";

const app = fastify();
app.addHook("onRequest", createAsyncContextFastifyHook());

app.get("/ping", async () => {
  const store = Context.getStore();
  return { instanceId: store?.instance_id ?? null };
});
```

### Koa

```ts
import Koa from "koa";
import { createAsyncContextKoaMiddleware, Context } from "@marceloraineri/async-context";

const app = new Koa();
app.use(createAsyncContextKoaMiddleware());

app.use(async (ctx) => {
  const store = Context.getStore();
  ctx.body = { instanceId: store?.instance_id ?? null };
});
```

### Next.js API routes

```ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createAsyncContextNextHandler, Context } from "@marceloraineri/async-context";

export default createAsyncContextNextHandler(
  async (_req: NextApiRequest, res: NextApiResponse) => {
    const store = Context.getStore();
    res.status(200).json({ instanceId: store?.instance_id ?? null });
  }
);
```

### NestJS

`AsyncContextNestMiddleware` reuses the Express integration to enable async context in Nest (Express adapter).

```ts
import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { AsyncContextNestMiddleware } from "@marceloraineri/async-context";

@Module({})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AsyncContextNestMiddleware).forRoutes("*");
  }
}
```

### AdonisJS

`AsyncContextAdonisMiddleware` plugs into the AdonisJS pipeline and creates one context per request.

```ts
// app/Http/Middleware/AsyncContext.ts
import { AsyncContextAdonisMiddleware } from "@marceloraineri/async-context";

export default AsyncContextAdonisMiddleware;
```

### Sentry (optional)

AsyncContext can enrich Sentry events with the active store. If `@sentry/node` is not installed, the helpers safely no-op.
Sensitive fields are redacted by default. Disable with `redactDefaults: false` or add `redactFieldNames`.

```ts
import express from "express";
import {
  AsyncContextExpressMiddleware,
  initSentryWithAsyncContext,
  sentryAsyncContextExpressMiddleware,
  sentryErrorHandler,
} from "@marceloraineri/async-context";

initSentryWithAsyncContext({
  sentryInit: {
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  },
  redactKeys: ["async_context.token"],
});

const app = express();
app.use(AsyncContextExpressMiddleware);
app.use(sentryAsyncContextExpressMiddleware());

app.get("/ping", (_req, res) => res.json({ ok: true }));

app.use(sentryErrorHandler());
```

## API overview

- `Context.run(store, callback)` and `Context.run(callback)`
- `Context.getStore()` and `Context.requireStore()`
- `Context.getValue(key)` and `Context.requireValue(key)`
- `Context.addValue(key, value)` and `Context.addObjectValue(values)`
- `Context.runWith(values, callback)`
- `Context.snapshot()` and `Context.reset()`
- `createLogger(options)` and `new Logger(options)`
- `Logger.child(bindings, options?)`, `Logger.withBindings(bindings, callback, options?)`, and `Logger.startTimer(level?)`
- `createConsoleTransport(options)`
- `createLoggerFromEnv(options)` and `loggerPreset(preset)`
- `parseBooleanEnv(value)`, `parseNumberEnv(value)`, `parseCsvEnv(value)`, `parseLogLevelEnv(value)`, `parseLogFormatEnv(value)`, `parseLoggerPresetEnv(value)`
- `createAsyncContextExpressMiddleware(options)`
- `createAsyncContextFastifyHook(options)` and `registerAsyncContextFastify(app, options)`
- `createAsyncContextKoaMiddleware(options)`
- `createAsyncContextNextHandler(handler, options)`
- `withOpenTelemetrySpan(name, callback, options)` and `recordOpenTelemetrySpan(summary, options)`
- `createAsyncContextExpressOpenTelemetryMiddleware(options)`
- `createAsyncContextFastifyOpenTelemetryHook(options)`
- `createAsyncContextKoaOpenTelemetryMiddleware(options)`
- `createAsyncContextNextOpenTelemetryHandler(handler, options)`
- `setOpenTelemetryBaggageFromContext(options)` and `mergeContextFromOpenTelemetryBaggage(options)`
- `extractOpenTelemetryContextFromHeaders(headers, options)` and `injectOpenTelemetryContextToHeaders(headers, options)`
- `initSentryWithAsyncContext(options)` and `captureExceptionWithContext(error)`

## Best practices

- Avoid replacing the entire store object; prefer `addValue` and `addObjectValue`.
- Long-lived contexts can retain memory; always complete the flow (`next()` in middleware).
- `AsyncLocalStorage` is per-process, so each worker maintains its own context.

## Contributing

Issues and pull requests are welcome. Include repro steps, tests, or concrete usage scenarios when possible.
