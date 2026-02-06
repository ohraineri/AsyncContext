import { describe, expect, it, vi } from "vitest";
import { Context } from "../core/context";

type ScopeCapture = {
  tags: Record<string, string>;
  extras: Record<string, unknown>;
  users: Array<Record<string, unknown>>;
};

function createScopeCapture() {
  const capture: ScopeCapture = { tags: {}, extras: {}, users: [] };
  const scope = {
    setTag: vi.fn((key: string, value: string) => {
      capture.tags[key] = value;
    }),
    setExtra: vi.fn((key: string, value: unknown) => {
      capture.extras[key] = value;
    }),
    setUser: vi.fn((user: Record<string, unknown>) => {
      capture.users.push(user);
    }),
    setContext: vi.fn(),
  };
  return { scope, capture };
}

async function loadWithMock(moduleFactory: () => Record<string, unknown>) {
  vi.resetModules();
  vi.doMock("@sentry/node", moduleFactory);
  return import("../core/integrations/sentry");
}

describe("Sentry integration (mocked)", () => {
  it("binds store using configureScope and applies redaction", async () => {
    const { scope, capture } = createScopeCapture();
    const sentryModule = {
      default: {
        init: vi.fn(),
        configureScope: (cb: (scope: typeof scope) => void) => cb(scope),
        captureException: vi.fn(() => "event-1"),
      },
    };

    const sentry = await loadWithMock(() => sentryModule);

    const circular: Record<string, unknown> = { name: "circle" };
    circular.self = circular;
    const deep = {
      a: { b: { c: { d: { e: { f: { g: "deep" } } } } } },
    };
    class CustomClass {
      value = "custom";
    }

    await Context.run(
      {
        requestId: "req-1",
        tenant_id: 123,
        user: { id: "u1", username: "ada", email: "ada@example.com", password: "secret" },
        token: "secret-token",
        secretKey: "top-secret",
        customTag: "x".repeat(300),
        tagDate: new Date("2020-01-01T00:00:00.000Z"),
        tagObj: { hello: "world" },
        tagCircular: circular,
        extraValue: "y".repeat(200),
        extraCircular: circular,
        deep,
        klass: new CustomClass(),
        error: new Error("boom"),
        big: BigInt(9),
        nullTag: null,
      },
      async () => {
        const ok = await sentry.bindAsyncContextToSentryScope({
          request: { method: "GET", url: "/path", route: { path: "/path" } },
          tagKeys: [
            "tenant_id",
            { key: "customTag", name: "custom_tag" },
            { key: "tagDate", name: "tag_date" },
            { key: "tagObj", name: "tag_obj" },
            { key: "tagCircular", name: "tag_circular" },
            { key: "nullTag", name: "null_tag" },
          ],
          extraKeys: [
            "extraValue",
            { key: "extraCircular", name: "extra_circular" },
          ],
          redactKeys: ["async_context.secretKey"],
          redactFieldNames: ["token"],
          maxExtraSize: 20,
        });
        expect(ok).toBe(true);
      }
    );

    expect(capture.tags.request_id).toBe("req-1");
    expect(capture.tags.tenant_id).toBe("123");
    expect(capture.tags.method).toBe("GET");
    expect(capture.tags.url).toBe("/path");
    expect(capture.tags.route).toBe("/path");
    expect(capture.tags.custom_tag.length).toBe(256);
    expect(capture.tags.tag_date).toBe("2020-01-01T00:00:00.000Z");
    expect(capture.tags.tag_obj).toContain("hello");
    expect(capture.tags.tag_circular).toBeDefined();

    expect(capture.extras.request_id).toBe("req-1");
    expect(typeof capture.extras.extraValue).toBe("string");
    expect(String(capture.extras.extraValue)).toContain("[truncated]");
    expect(typeof capture.extras.extra_circular).toBe("string");

    const storeExtra = capture.extras.async_context as Record<string, unknown>;
    expect(storeExtra.secretKey).toBe("[REDACTED]");
    expect(storeExtra.token).toBe("[REDACTED]");
    expect((storeExtra.user as Record<string, unknown>).password).toBe("[REDACTED]");
    expect(((storeExtra.deep as any).a.b.c.d.e.f.g)).toBe("[MaxDepth]");
    expect(typeof storeExtra.klass).toBe("string");
    expect((storeExtra.error as Record<string, unknown>).message).toBe("boom");
    expect(storeExtra.big).toBe("9");

    expect(capture.users[0]).toEqual({
      id: "u1",
      username: "ada",
      email: "ada@example.com",
    });
  });

  it("captures exceptions using withScope and caches the client", async () => {
    const { scope, capture } = createScopeCapture();
    const sentryModule = {
      withScope: (cb: (scope: typeof scope) => void) => cb(scope),
      captureException: vi.fn(() => "event-2"),
    };

    const sentry = await loadWithMock(() => sentryModule);

    const result = await Context.run({ requestId: "req-2" }, async () => {
      const first = await sentry.captureExceptionWithContext(new Error("boom"));
      const second = await sentry.captureExceptionWithContext(new Error("boom"));
      return [first, second];
    });

    expect(result).toEqual(["event-2", "event-2"]);
    expect(capture.tags.request_id).toBe("req-2");
  });

  it("captures exceptions using configureScope when withScope is absent", async () => {
    const { scope } = createScopeCapture();
    const sentryModule = {
      configureScope: (cb: (scope: typeof scope) => void) => cb(scope),
      captureException: vi.fn(() => "event-3"),
    };

    const sentry = await loadWithMock(() => sentryModule);

    const result = await Context.run({ requestId: "req-3" }, async () => {
      return sentry.captureExceptionWithContext(new Error("fail"));
    });

    expect(result).toBe("event-3");
  });

  it("initializes sentry and wires helpers", async () => {
    const { scope } = createScopeCapture();
    const sentryModule = {
      init: vi.fn(),
      withScope: (cb: (scope: typeof scope) => void) => cb(scope),
      captureException: vi.fn(() => "event-4"),
    };

    const sentry = await loadWithMock(() => ({ default: sentryModule }));

    const ok = await sentry.initSentryWithAsyncContext({
      sentryInit: { dsn: "http://dsn" },
      includeDefaults: false,
    });

    expect(ok).toBe(true);
    expect(sentryModule.init).toHaveBeenCalledWith({ dsn: "http://dsn" });
  });

  it("middleware uses withScope when available", async () => {
    const { scope } = createScopeCapture();
    const sentryModule = {
      withScope: (cb: (scope: typeof scope) => void) => cb(scope),
    };

    const sentry = await loadWithMock(() => sentryModule);

    const middleware = sentry.sentryAsyncContextExpressMiddleware();
    let called = false;
    await middleware({} as any, {} as any, () => {
      called = true;
    });

    expect(called).toBe(true);
  });

  it("throws when sentry import fails with unexpected errors", async () => {
    vi.resetModules();
    const error = Object.assign(new Error("boom"), { code: "EOTHER" });
    vi.doMock("@sentry/node", () => {
      throw error;
    });

    const sentry = await import("../core/integrations/sentry");

    await expect(sentry.bindAsyncContextToSentryScope()).rejects.toThrow("boom");

    const middleware = sentry.sentryAsyncContextExpressMiddleware();
    let passed: unknown;
    await middleware({} as any, {} as any, (err?: unknown) => {
      passed = err;
    });

    expect(passed).toBe(error);
  });
});
