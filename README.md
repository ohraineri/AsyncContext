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

const asyncLocal = Context.getInstance();

await asyncLocal.run({ request_id: crypto.randomUUID() }, async () => {
  Context.addValue("user", { id: 42, name: "Ada" });

  await Promise.resolve();

  const store = asyncLocal.getStore();
  console.log(store?.request_id); // 184fa9a3-f967-4a98-9d8f-57152e7cbe64
  console.log(store?.user); // { id: 42, name: "Ada" }
});
```

## Express middleware

`AsyncContextExpresssMiddleware` (note the triple “s”) creates a new context for every Express request, seeds it with a UUID `instance_id`, and ensures the context is available throughout the request lifecycle.

```ts
import express from "express";
import { AsyncContextExpresssMiddleware, Context } from "@marceloraineri/async-context";

const app = express();

app.use(AsyncContextExpresssMiddleware);

app.get("/ping", (_req, res) => {
  const store = Context.getInstance().getStore();
  res.json({ instanceId: store?.instance_id ?? null });
});

app.listen(3000, () => console.log("API listening on :3000"));
```

## Sentry integration (optional)

This package does not ship with Sentry as a dependency. To enable the integration, install `@sentry/node` in your application:

```bash
npm i @sentry/node
```

Then wire the middleware in the recommended order (AsyncContext, Sentry scope, routes, Sentry error handler):

```ts
import express from "express";
import {
  AsyncContextExpresssMiddleware,
  initSentryWithAsyncContext,
  sentryAsyncContextExpressMiddleware,
  sentryErrorHandler,
} from "@marceloraineri/async-context";

initSentryWithAsyncContext({
  sentryInit: {
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 1.0,
  },
  redactKeys: ["async_context.token", "async_context.user.password"],
});

const app = express();

app.use(AsyncContextExpresssMiddleware);
app.use(sentryAsyncContextExpressMiddleware());

app.get("/ping", (_req, res) => res.json({ ok: true }));

app.use(sentryErrorHandler());
```

Notes:

- If `@sentry/node` is not installed, all Sentry helpers become safe no-ops.
- The async context store is attached under the `async_context` extra by default (configurable via `extraName` or disabled with `attachStore: false`).
- Default tags include `request_id` and `tenant_id` when present, plus optional `route`, `method`, and `url` in Express.
- Use `redactKeys` to mask sensitive fields before they are sent.

Common options:

- `includeDefaults`: enable/disable default mappings (`request_id`, `tenant_id`, user fields).
- `tagKeys`: map store keys to Sentry tags (`["customer_id"]` or `{ key, name }` objects).
- `extraKeys`: map store keys to Sentry extras.
- `user`: customize which store fields map to `id`, `username`, and `email`.
- `attachStore`: attach the full store as an extra (default `true`).
- `extraName`: name of the full-store extra (default `async_context`).
- `redactKeys`: dot-paths to redact (`["async_context.token"]`).
- `maxExtraSize`: byte limit for serialized extras (default 16 KB).

Manual capture example:

```ts
import { captureExceptionWithContext } from "@marceloraineri/async-context";

try {
  throw new Error("boom");
} catch (error) {
  await captureExceptionWithContext(error);
}
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
Returns (and lazily instantiates) the singleton `AsyncLocalStorage` used by the library. Use `run(store, callback)` on the returned instance to spawn a new async context.

### `Context.addValue(key, value): Record<string, unknown>`
Adds a key/value pair to the active context. Throws if no context is active.

### `Context.addObjectValue(values: Record<string, unknown>): Record<string, unknown>`
Merges the provided object into the active context. Throws if no context is active.

### `Context.remove(key)` / `Context.safeRemove(key)`
Removes a key from the active context. `safeRemove` throws if the key does not exist.

### `AsyncContextExpresssMiddleware(req, res, next)`
Express middleware that:

1. Generates a UUID via `crypto.randomUUID()`.
2. Calls `Context.getInstance().run({ instance_id: uuid }, () => next())`.
3. Makes the context (and `instance_id`) available to downstream code.

### `AsyncContextNestMiddleware`
Nest middleware (Express adapter) that initializes a new async context per request by delegating to `AsyncContextExpresssMiddleware`.

### `AsyncContextAdonisMiddleware`
AdonisJS middleware that initializes a new async context per request using `Context.getInstance().run(...)`.

### `initSentryWithAsyncContext(options)`
Initializes Sentry (via `sentryInit`) and immediately binds the active async context to the Sentry scope.

### `bindAsyncContextToSentryScope(options)`
Copies the active async context into the Sentry scope (tags, extras, and user mapping).

### `captureExceptionWithContext(error, options)`
Captures an exception while attaching the active async context to the scope.

### `sentryAsyncContextExpressMiddleware(options)`
Express middleware that creates a fresh Sentry scope per request and attaches the async context and request tags.

### `sentryErrorHandler(options)`
Express error handler that captures the exception with async context and then calls `next(err)`.

## Best practices & caveats

- Avoid replacing the entire store object manually; instead mutate it through `addValue`/`addObjectValue` to keep shared references intact.
- `AsyncLocalStorage` state is scoped to a single Node.js process. If you spawn workers or separate processes, each will maintain its own context.
- Be mindful of long-lived contexts: if you never exit a `run` callback (e.g., forgetting to call `next()` in Express), the store will never be released.

## Contributing

Issues and pull requests are welcome. Please include reproduction steps or tests whenever you propose a change to the async context behavior.
