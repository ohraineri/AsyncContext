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
import { Context } from "@marceloraineri/async-context";
  Context.addValue("user", { id: 42, name: "Ada" });

  await Promise.resolve();

  const store = Context.getInstance().getStore();
  console.log(store.requestId); // 184fa9a3-f967-4a98-9d8f-57152e7cbe64
  console.log(store.user); // { id: 42, name: "Ada" }
```

## Express middleware

`AsyncContextExpresssMiddleware` (note the triple “s”) creates a new context for every Express request, seeds it with a UUID `instance_id`, and ensures the context is available throughout the request lifecycle.

```ts
import express from "express";
import {
  AsyncContextExpresssMiddleware,
  Context,
} from "@marceloraineri/async-context";

const app = express();

app.use(AsyncContextExpresssMiddleware);

app.get("/ping", (_req, res) => {
  const store = Context.getInstance().getStore();
  res.json({ instanceId: store?.instance_id ?? null });
});

app.listen(3000, () => console.log("API listening on :3000"));
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

## API reference

### `Context.getInstance(): AsyncLocalStorage`
Returns (and lazily instantiates) the singleton `AsyncLocalStorage` used by the library. You typically call `run(store, callback)` on this instance to spawn a new context.

### `Context.addObjectValue(values: Record<string, unknown>): Record<string, unknown>`
Merges the provided object into the active context. Also throws if no context is active.

### `AsyncContextExpresssMiddleware(req, res, next)`
Express middleware that:

1. Generates a UUID via `crypto.randomUUID()`.
2. Calls `Context.getInstance().run({ instance_id: uuid }, () => next())`.
3. Makes the context (and `instance_id`) available to any downstream code.

### `AsyncContextNestMiddleware`
Nest middleware (Express adapter) that initializes a new async context per request by delegating to `AsyncContextExpresssMiddleware`.

## Best practices & caveats

- Avoid replacing the entire store object manually; instead mutate it through `addValue`/`addObjectValue` to keep shared references intact.
- `AsyncLocalStorage` state is scoped to a single Node.js process. If you spawn workers or separate processes, each will maintain its own context.
- Be mindful of long-lived contexts: if you never exit a `run` callback (e.g., forgetting to call `next()` in Express), the store will never be released.

## Contributing

Issues and pull requests are welcome. Please include reproduction steps or tests whenever you propose a change to the async context behavior.
