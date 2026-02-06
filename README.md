# AsyncContext

> Request-scoped context storage backed by Node.js `AsyncLocalStorage`, with first-class Express integration.

AsyncContext is a tiny utility library that standardizes how you propagate contextual data across asynchronous flows. It offers a singleton `Context` wrapper around `AsyncLocalStorage` plus helpers to enrich the active store and an Express middleware that bootstraps a fresh context for every incoming request.

## Why AsyncContext?

- **Consistent async context** – Create one logical context per request, job, or background task without passing parameters through every function call.
- **Drop-in API** – Call `Context.addValue` or `Context.addObjectValue` anywhere inside the active flow to append metadata.
- **Observability ready** – Ship correlation IDs, tenant information, user data, or tracing metadata through your stack.
- **Framework friendly** – Includes an `AsyncContextExpresssMiddleware` that assigns a unique `instance_id` to each Express request and runs all downstream handlers inside that context.

## Installation

```bash
npm i @marceloraineri/async-context
```

When developing locally inside this repo, import from the relative `core` entry point instead.

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

## Logging

AsyncContext now ships with a structured logger that automatically merges the active async context into every log entry. It supports levels, redaction, sampling, timers, transports, and JSON/pretty output.

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

## Express middleware

`AsyncContextExpresssMiddleware` (note the triple “s”) and `AsyncContextExpressMiddleware` (alias) create a new context for every Express request, seed it with a UUID `instance_id`, and ensure the context is available throughout the request lifecycle.

```ts
import express from "express";
import {
  AsyncContextExpressMiddleware,
  Context,
} from "@marceloraineri/async-context";

const app = express();

app.use(AsyncContextExpressMiddleware);

app.get("/ping", (_req, res) => {
  const store = Context.getStore();
  res.json({ instanceId: store?.instance_id ?? null });
});

app.listen(3000, () => console.log("API listening on :3000"));
```

If you need custom seed data or a different request-id key, use `createAsyncContextExpressMiddleware`.

```ts
import express from "express";
import {
  createAsyncContextExpressMiddleware,
  Context,
} from "@marceloraineri/async-context";

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

## Nest middleware

`AsyncContextNestMiddleware` reuses the Express middleware so you can enable async context in Nest (default Express adapter).

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

> Note: This middleware targets Nest's Express adapter. If you use the Fastify adapter, consider a custom interceptor that calls `Context.getInstance().run(...)` per request.

## AdonisJS middleware

`AsyncContextAdonisMiddleware` plugs into AdonisJS' middleware pipeline and initializes a new async context for each request.

```ts
// app/Http/Middleware/AsyncContext.ts
import { AsyncContextAdonisMiddleware } from "@marceloraineri/async-context";

export default AsyncContextAdonisMiddleware;
```

Register it as a global middleware in your AdonisJS kernel (per your Adonis version docs).

## API reference

### `Context.getInstance(): AsyncLocalStorage`
Returns (and lazily instantiates) the singleton `AsyncLocalStorage` used by the library. You typically call `run(store, callback)` on this instance to spawn a new context.

### `Context.run(store, callback)` / `Context.run(callback)`
Creates a new async context and executes the callback inside it. Returns the callback result (including a Promise when the callback is async).

### `Context.runWith(values, callback)`
Creates a child context by cloning the current store and merging the provided values without mutating the parent store.

### `Context.getStore()` / `Context.requireStore()`
Returns the active store (or throws when none is active).

### `Context.getValue(key, defaultValue?)` / `Context.requireValue(key)`
Fetches a key from the active store, with either a default or an error if missing.

### `Context.has(key)` / `Context.setDefault(key, value)`
Checks for a key or sets it only when it does not exist yet.

### `Context.snapshot()` / `Context.reset()`
Creates a shallow copy of the store or clears all keys from the active store.

### `Context.enterWith(store)`
Advanced usage helper to enter a store for the current execution.

### `Context.addObjectValue(values: Record<string, unknown>): Record<string, unknown>`
Merges the provided object into the active context. Also throws if no context is active.

### `createLogger(options)` / `new Logger(options)`
Creates a structured logger. It supports log levels, context merging, redaction, sampling, timers, and transports.

### `Logger.log(level, messageOrData?, dataOrError?, error?)`
Writes a log entry at the chosen level. Accepts a message string or data object as the first argument.

### `Logger.child(bindings)`
Creates a child logger that automatically attaches the provided bindings to every log entry.

### `Logger.startTimer(level?)`
Starts a high-resolution timer and returns a function that logs duration when called.

### `createConsoleTransport(options)`
Console transport helper with JSON or pretty formatting and stderr routing for error levels.

### `AsyncContextExpresssMiddleware(req, res, next)`
Express middleware that:

1. Generates a UUID via `crypto.randomUUID()`.
2. Calls `Context.getInstance().run({ instance_id: uuid }, () => next())`.
3. Makes the context (and `instance_id`) available to any downstream code.

### `AsyncContextExpressMiddleware`
Alias of `AsyncContextExpresssMiddleware` with corrected spelling.

### `createAsyncContextExpressMiddleware(options)`
Factory for building customized Express middleware. Supports `idKey`, `idFactory`, and `seed` (object or function).

### `AsyncContextNestMiddleware`
Nest middleware (Express adapter) that initializes a new async context per request by delegating to `AsyncContextExpresssMiddleware`.

### `AsyncContextAdonisMiddleware`
AdonisJS middleware that initializes a new async context per request using `Context.getInstance().run(...)`.

## Best practices & caveats

- Avoid replacing the entire store object manually; instead mutate it through `addValue`/`addObjectValue` to keep shared references intact.
- `AsyncLocalStorage` state is scoped to a single Node.js process. If you spawn workers or separate processes, each will maintain its own context.
- Be mindful of long-lived contexts: if you never exit a `run` callback (e.g., forgetting to call `next()` in Express), the store will never be released.

## Contributing

Issues and pull requests are welcome. Please include reproduction steps or tests whenever you propose a change to the async context behavior.
