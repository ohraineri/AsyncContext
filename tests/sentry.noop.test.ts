import { describe, expect, it, vi } from "vitest";
import {
  bindAsyncContextToSentryScope,
  captureExceptionWithContext,
  initSentryWithAsyncContext,
  sentryAsyncContextExpressMiddleware,
  sentryErrorHandler,
} from "../core/integrations/sentry";

describe("sentry integration (no SDK)", () => {
  it("no-ops safely when @sentry/node is missing", async () => {
    await expect(initSentryWithAsyncContext()).resolves.toBe(false);
    await expect(bindAsyncContextToSentryScope()).resolves.toBe(false);
    await expect(captureExceptionWithContext(new Error("boom"))).resolves.toBeNull();

    const middleware = sentryAsyncContextExpressMiddleware();
    const next = vi.fn();
    await middleware({}, {}, next);
    expect(next).toHaveBeenCalledTimes(1);

    const errorHandler = sentryErrorHandler();
    const nextErr = vi.fn();
    const err = new Error("failure");
    await errorHandler(err, {}, {}, nextErr);
    expect(nextErr).toHaveBeenCalledWith(err);
  });
});
