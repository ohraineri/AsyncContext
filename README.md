# AsyncContext

> Async context propagation and structured logging for Node.js, with first-class framework integrations.

AsyncContext helps you carry contextual data across asynchronous boundaries without passing parameters through every function. It provides a `Context` wrapper around `AsyncLocalStorage`, ready-made middleware for popular frameworks, and a structured logger that automatically includes the active context in every log entry.

## Highlights

- Consistent per-request context without parameter threading.
- Simple, direct API for reading and writing context anywhere in the async flow.
- Observability-ready with correlation IDs, tenant/user data, and tracing metadata.
- Full-featured logger with levels, redaction, sampling, timers, and transports.
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

  await Promise.resolve();

  const store = Context.getStore();
  console.log(store?.requestId); // 184fa9a3-f967-4a98-9d8f-57152e7cbe64
  console.log(store?.user); // { id: 42, name: "Ada" }
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

### Timers and child loggers

```ts
import { createLogger } from "@marceloraineri/async-context";

const logger = createLogger({ name: "jobs", level: "debug" });
const jobLogger = logger.child({ job: "import-users" });

const end = jobLogger.startTimer("debug");
await Promise.resolve();
end("job completed");
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
- `Logger.child(bindings)` and `Logger.startTimer(level?)`
- `createConsoleTransport(options)`
- `createAsyncContextExpressMiddleware(options)`
- `createAsyncContextFastifyHook(options)` and `registerAsyncContextFastify(app, options)`
- `createAsyncContextKoaMiddleware(options)`
- `createAsyncContextNextHandler(handler, options)`
- `initSentryWithAsyncContext(options)` and `captureExceptionWithContext(error)`

## Best practices

- Avoid replacing the entire store object; prefer `addValue` and `addObjectValue`.
- Long-lived contexts can retain memory; always complete the flow (`next()` in middleware).
- `AsyncLocalStorage` is per-process, so each worker maintains its own context.

## Contributing

Issues and pull requests are welcome. Include repro steps, tests, or concrete usage scenarios when possible.
