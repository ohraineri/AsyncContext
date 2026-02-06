import { describe, expect, it } from "vitest";
import {
  AsyncContextExpressMiddleware,
  AsyncContextExpresssMiddleware,
  createAsyncContextExpressMiddleware,
} from "../core/integrations/express";
import { AsyncContextNestMiddleware } from "../core/integrations/nest";
import { AsyncContextAdonisMiddleware } from "../core/integrations/adonis";
import { Context } from "../core/context";

const req = {} as unknown;
const res = {} as unknown;

describe("Express integration", () => {
  it("initializes context with defaults", () => {
    let store: Record<string, unknown> | undefined;

    AsyncContextExpresssMiddleware(req as any, res as any, () => {
      store = Context.getStore();
    });

    expect(store?.instance_id).toBeTypeOf("string");
  });

  it("exposes alias with corrected spelling", () => {
    expect(AsyncContextExpressMiddleware).toBe(AsyncContextExpresssMiddleware);
  });

  it("supports custom id key and seed", () => {
    let store: Record<string, unknown> | undefined;
    const middleware = createAsyncContextExpressMiddleware({
      idKey: "request_id",
      idFactory: () => "fixed",
      seed: { role: "admin" },
    });

    middleware(req as any, res as any, () => {
      store = Context.getStore();
    });

    expect(store).toEqual({ role: "admin", request_id: "fixed" });
  });
});

describe("Nest integration", () => {
  it("delegates to express middleware", () => {
    let store: Record<string, unknown> | undefined;
    const middleware = new AsyncContextNestMiddleware();

    middleware.use(req, res, () => {
      store = Context.getStore();
    });

    expect(store?.instance_id).toBeTypeOf("string");
  });
});

describe("Adonis integration", () => {
  it("initializes context and awaits next", async () => {
    const middleware = new AsyncContextAdonisMiddleware();
    const result = await middleware.handle({}, async () => {
      const store = Context.getStore();
      return store?.instance_id;
    });

    expect(result).toBeTypeOf("string");
  });
});
