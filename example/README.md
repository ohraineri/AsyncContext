# Examples

These files show how to use AsyncContext in different scenarios. They are not part of the build and are meant for reference.

## Prerequisites

- Node.js 18+
- Install dependencies at the repo root (`npm install`)

Some examples require extra dependencies (install if you want to run them):
- `express`
- `fastify`
- `koa`
- `next`
- `@nestjs/common`
- `@sentry/node`
- `@opentelemetry/api`

## Run a file

```bash
npx tsx example/basic-context.ts
```

If you do not have `tsx` available, run from the repo root:

```bash
npm run dev -- example/basic-context.ts
```

## Environment variables

- `SENTRY_DSN` (only needed by `example/sentry.ts`)

## Files
- `example/basic-context.ts` Basic Context usage (run, add values, snapshot).
- `example/logger-basic.ts` Logger with context, redaction, child logger, and timer.
- `example/logger-env.ts` Logger configured from environment.
- `example/performance.ts` Context.measure usage.
- `example/openai.ts` OpenAI wrapper with a fake call.
- `example/opentelemetry.ts` OpenTelemetry span and baggage with optional dynamic import.
- `example/sentry.ts` Sentry init and exception capture with optional dynamic import.
- `example/express.ts` Express middleware integration.
- `example/fastify.ts` Fastify hook integration.
- `example/koa.ts` Koa middleware integration.
- `example/next-api.ts` Next.js API handler integration.
- `example/nest.ts` Nest middleware integration (Express adapter).
- `example/adonis.ts` Adonis middleware integration.
