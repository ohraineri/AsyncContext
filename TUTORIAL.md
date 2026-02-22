# AsyncContext Tutorial

This tutorial walks you step by step through configuring AsyncContext in Node.js apps, propagating data across async flows, integrating with HTTP frameworks, and adopting structured logging with context.

## Table of contents

1. Installation
2. First context
3. Reading and writing data
4. Derived contexts
5. Snapshot, reset, and removal
6. Framework integrations
7. Structured logger
8. Environment configuration
9. Performance measurement
10. OpenAI integration
11. OpenTelemetry integration
12. Sentry integration
13. Best practices and pitfalls
14. Quick troubleshooting

## 1. Installation

```bash
npm i @marceloraineri/async-context
```

## 2. First context

Create a context and share data across the entire async chain:

```ts
import crypto from "node:crypto";
import { Context } from "@marceloraineri/async-context";

await Context.run({ requestId: crypto.randomUUID() }, async () => {
  Context.addValue("user", { id: 42, name: "Ada" });
  await Promise.resolve();

  console.log(Context.getValue("requestId"));
  console.log(Context.getValue("user"));
});
```

Use `Context.run(() => { ... })` when you do not need an initial store.

## 3. Reading and writing data

### Reading

```ts
const requestId = Context.getValue<string>("requestId");
const userId = Context.requireValue<number>("userId");

if (Context.has("tenantId")) {
  // ...
}

Context.setDefault("locale", "en-US");
```

### Writing

```ts
Context.addValue("tenantId", "t_123");
Context.addObjectValue({ feature: "beta", region: "sa-east-1" });
Context.addOptions({ retry: 2, cache: true });
Context.addOptions({ flag: "canary" }, "flags");
```

## 4. Derived contexts

Create a child context without mutating the parent:

```ts
Context.run({ requestId: "req_1" }, () => {
  Context.runWith({ jobId: "job_9" }, () => {
    console.log(Context.getValue("requestId"));
    console.log(Context.getValue("jobId"));
  });
});
```

## 5. Snapshot, reset, and removal

```ts
const snapshot = Context.snapshot();
Context.remove("token");
Context.safeRemove("feature");
Context.reset();
```

`Context.snapshot()` returns a shallow copy of the current store. `Context.reset()` removes all keys.

## 6. Framework integrations

### Express

Default middleware (creates an `instance_id` per request):

```ts
import express from "express";
import { AsyncContextExpressMiddleware, Context } from "@marceloraineri/async-context";

const app = express();
app.use(AsyncContextExpressMiddleware);

app.get("/ping", (_req, res) => {
  res.json({ instanceId: Context.getValue("instance_id") ?? null });
});
```

Customization with `idKey` and `seed`:

```ts
import { createAsyncContextExpressMiddleware } from "@marceloraineri/async-context";

app.use(
  createAsyncContextExpressMiddleware({
    idKey: "request_id",
    seed: (req) => ({ method: req.method, path: req.url }),
  })
);
```

### Fastify

```ts
import fastify from "fastify";
import { createAsyncContextFastifyHook, Context } from "@marceloraineri/async-context";

const app = fastify();
app.addHook("onRequest", createAsyncContextFastifyHook());

app.get("/ping", async () => ({ instanceId: Context.getValue("instance_id") ?? null }));
```

### Koa

```ts
import Koa from "koa";
import { createAsyncContextKoaMiddleware, Context } from "@marceloraineri/async-context";

const app = new Koa();
app.use(createAsyncContextKoaMiddleware());

app.use(async (ctx) => {
  ctx.body = { instanceId: Context.getValue("instance_id") ?? null };
});
```

### Next.js API routes

```ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createAsyncContextNextHandler, Context } from "@marceloraineri/async-context";

export default createAsyncContextNextHandler(
  async (_req: NextApiRequest, res: NextApiResponse) => {
    res.status(200).json({ instanceId: Context.getValue("instance_id") ?? null });
  }
);
```

### NestJS (Express adapter)

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

```ts
// app/Http/Middleware/AsyncContext.ts
import { AsyncContextAdonisMiddleware } from "@marceloraineri/async-context";

export default AsyncContextAdonisMiddleware;
```

## 7. Structured logger

The logger automatically includes the active context in each log entry (by default under the `context` key) and supports redaction, sampling, and timers.

```ts
import { Context, createLogger } from "@marceloraineri/async-context";

const logger = createLogger({
  name: "api",
  level: "info",
  contextKey: "ctx",
  redactKeys: ["ctx.token", "data.password"],
});

await Context.run({ requestId: "req_1", token: "secret" }, async () => {
  logger.info("request started", { route: "/ping" });
});
```

Child logger and timer:

```ts
const jobLogger = logger.child({ job: "import-users" });
const end = jobLogger.startTimer("debug");
await Promise.resolve();
end("job completed");
```

## 8. Environment configuration

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

Key variables:

| Variable | Description | Example |
| --- | --- | --- |
| `LOG_PRESET` | `development`, `production`, `test` | `production` |
| `LOG_LEVEL` | minimum level (name or numeric) | `info` |
| `LOG_FORMAT` | `json` or `pretty` | `json` |
| `LOG_CONTEXT` | attach context | `true` |
| `LOG_CONTEXT_KEY` | context key name | `context` |
| `LOG_CONTEXT_KEYS` | allowlist keys (CSV or JSON array) | `requestId,tenantId` |
| `LOG_REDACT_KEYS` | redaction paths (CSV or JSON array) | `context.token,data.password` |
| `LOG_REDACT_FIELDS` | extra sensitive fields (CSV or JSON array) | `accessToken,creditCard` |
| `LOG_BINDINGS` | JSON object or key=value pairs added to every log entry | `{"service":"api","version":2}` |
| `LOG_SAMPLE_RATE` | 0..1 or percent | `0.25` |

You can also use `LOGGER_` aliases (for example `LOGGER_LEVEL`) for every `LOG_` variable.
CSV list values accept commas or semicolons as separators.

## 9. Performance measurement

```ts
import { Context } from "@marceloraineri/async-context";

await Context.run({}, async () => {
  await Context.measure(
    "db.query",
    async () => {
      await Promise.resolve();
    },
    { data: { table: "users" } }
  );

  console.log(Context.getValue("perf"));
});
```

Use `key` and `mode` to control where entries are stored:

```ts
Context.measure("cache.lookup", () => "hit", { key: "performance", mode: "overwrite" });
```

## 10. OpenAI integration

```ts
import OpenAI from "openai";
import { Context, withOpenAIContext } from "@marceloraineri/async-context";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

await Context.run({ requestId: "req_1" }, async () => {
  const response = await withOpenAIContext(
    "responses.create",
    { model: "gpt-4o-mini", input: "Hello" },
    (req) => openai.responses.create(req),
    { includeRequest: true }
  );

  console.log(response.id);
  console.log(Context.getValue("openai"));
});
```

By default, only safe request/response fields are included. You can allow extra keys with `requestKeys` and `responseKeys`.

## 11. OpenTelemetry integration

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
    "cache.lookup",
    async () => Promise.resolve("hit"),
    { api: otel, attributes: { cache: "redis" } }
  );

  setOpenTelemetryBaggageFromContext({
    api: otel,
    contextKeys: ["requestId", "tenantId"],
    baggagePrefix: "ctx.",
  });
});
```

The middleware extracts trace context from incoming headers, keeps the span active for downstream handlers, and records a summary under the `otel` key in the async context store.

## 12. Sentry integration

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

## 13. Best practices and pitfalls

- Prefer `addValue` and `addObjectValue` over replacing the entire store.
- Always complete middleware flows (`next()`) to avoid context leaks.
- Avoid storing large mutable objects in the context.
- `AsyncLocalStorage` is per process, so each worker has its own context.
- Use `contextKeys` in the logger to limit exposed fields.

## 14. Quick troubleshooting

- `No active context found`: you called `Context.getValue` outside `Context.run` or without middleware.
- `Context.addOptions` threw: the target key already existed and was not an object.
- Context missing in logs: check `context: true` and that a store exists.

---

For a quick overview, see the main `README.md`. This file is a step-by-step guide.
