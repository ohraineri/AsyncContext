import { beforeEach, describe, expect, it, vi } from "vitest";
import { Context } from "../core/context";

const sentryMock = vi.hoisted(() => {
  type Scope = {
    tags: Record<string, string>;
    extras: Record<string, unknown>;
    user: { id?: string; username?: string; email?: string } | null;
    setTag: (key: string, value: string) => void;
    setExtra: (key: string, value: unknown) => void;
    setUser: (user: { id?: string; username?: string; email?: string }) => void;
  };

  const createScope = (): Scope => {
    const scope: Scope = {
      tags: {},
      extras: {},
      user: null,
      setTag: (key, value) => {
        scope.tags[key] = value;
      },
      setExtra: (key, value) => {
        scope.extras[key] = value;
      },
      setUser: (user) => {
        scope.user = user;
      },
    };

    return scope;
  };

  const baseScope = createScope();
  const scopes: Scope[] = [];

  const sentry = {
    init: vi.fn(),
    configureScope: (callback: (scope: Scope) => void) => {
      callback(baseScope);
    },
    withScope: (callback: (scope: Scope) => void) => {
      const scope = createScope();
      scopes.push(scope);
      callback(scope);
    },
    captureException: vi.fn(() => "evt_1"),
  };

  const reset = () => {
    baseScope.tags = {};
    baseScope.extras = {};
    baseScope.user = null;
    scopes.length = 0;
    sentry.init.mockClear();
    sentry.captureException.mockClear();
  };

  return { sentry, scopes, baseScope, reset };
});

vi.mock("@sentry/node", () => sentryMock.sentry, { virtual: true });

import {
  bindAsyncContextToSentryScope,
  captureExceptionWithContext,
  sentryAsyncContextExpressMiddleware,
} from "../core/integrations/sentry";

describe("sentry integration (mocked SDK)", () => {
  beforeEach(() => {
    sentryMock.reset();
  });

  it("binds store values to the scope and redacts sensitive fields", async () => {
    const store = {
      requestId: "req-1",
      tenant_id: "tenant-1",
      userId: "user-42",
      user: { email: "user@example.com", password: "secret" },
      token: "tok-123",
      custom: "value",
    };

    await Context.getInstance().run(store, async () => {
      const result = await bindAsyncContextToSentryScope({
        extraKeys: ["custom"],
        tagKeys: ["custom"],
        redactKeys: ["async_context.token", "async_context.user.password"],
      });

      expect(result).toBe(true);
    });

    expect(sentryMock.baseScope.tags.request_id).toBe("req-1");
    expect(sentryMock.baseScope.extras.request_id).toBe("req-1");
    expect(sentryMock.baseScope.tags.tenant_id).toBe("tenant-1");
    expect(sentryMock.baseScope.tags.custom).toBe("value");
    expect(sentryMock.baseScope.extras.custom).toBe("value");

    expect(sentryMock.baseScope.user).toEqual(
      expect.objectContaining({ id: "user-42", email: "user@example.com" })
    );

    const asyncContext = sentryMock.baseScope.extras.async_context as {
      token?: string;
      user?: { password?: string };
    };

    expect(asyncContext.token).toBe("[REDACTED]");
    expect(asyncContext.user?.password).toBe("[REDACTED]");
  });

  it("creates isolated scopes per request", async () => {
    const middleware = sentryAsyncContextExpressMiddleware();

    await Context.getInstance().run({ requestId: "req-a" }, async () => {
      await middleware({ method: "GET", url: "/a" }, {}, () => undefined);
    });

    await Context.getInstance().run({ requestId: "req-b" }, async () => {
      await middleware({ method: "POST", url: "/b" }, {}, () => undefined);
    });

    expect(sentryMock.scopes).toHaveLength(2);
    expect(sentryMock.scopes[0].tags.request_id).toBe("req-a");
    expect(sentryMock.scopes[0].tags.method).toBe("GET");
    expect(sentryMock.scopes[1].tags.request_id).toBe("req-b");
    expect(sentryMock.scopes[1].tags.method).toBe("POST");
  });

  it("captures exceptions with async context", async () => {
    await Context.getInstance().run({ requestId: "req-99" }, async () => {
      const eventId = await captureExceptionWithContext(
        new Error("boom"),
        { tagKeys: ["requestId"] }
      );

      expect(eventId).toBe("evt_1");
    });

    expect(sentryMock.sentry.captureException).toHaveBeenCalledTimes(1);
    expect(sentryMock.scopes).toHaveLength(1);
    expect(sentryMock.scopes[0].tags.request_id).toBe("req-99");
  });
});
