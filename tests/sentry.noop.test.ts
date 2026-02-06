import { describe, expect, it, vi } from "vitest";

async function loadModule() {
  vi.resetModules();
  vi.unmock("@sentry/node");
  return import("../core/integrations/sentry");
}

describe("Sentry integration (no module)", () => {
  it("returns safe fallbacks when @sentry/node is missing", async () => {
    const sentry = await loadModule();

    const bound = await sentry.bindAsyncContextToSentryScope();
    expect(bound).toBe(false);

    const captured = await sentry.captureExceptionWithContext(new Error("boom"));
    expect(captured).toBeNull();

    const initialized = await sentry.initSentryWithAsyncContext();
    expect(initialized).toBe(false);
  });

  it("middleware and error handler still call next", async () => {
    const sentry = await loadModule();

    const middleware = sentry.sentryAsyncContextExpressMiddleware();
    let nextCalled = false;
    await middleware({} as any, {} as any, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);

    const errorHandler = sentry.sentryErrorHandler();
    let handled = false;
    await errorHandler(new Error("fail"), {} as any, {} as any, () => {
      handled = true;
    });
    expect(handled).toBe(true);
  });
});
