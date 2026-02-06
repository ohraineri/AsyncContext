import { describe, expect, it } from "vitest";
import {
  createAsyncContextFastifyHook,
  registerAsyncContextFastify,
} from "../core/integrations/fastify";
import { createAsyncContextKoaMiddleware } from "../core/integrations/koa";
import { createAsyncContextNextHandler } from "../core/integrations/next";
import { Context } from "../core/context";

describe("Fastify integration", () => {
  it("creates an onRequest hook with seeded context", () => {
    let store: Record<string, unknown> | undefined;
    const hook = createAsyncContextFastifyHook({
      idKey: "rid",
      idFactory: () => "fastify-1",
      seed: (req) => ({ service: "fastify", id: (req as { id?: string }).id }),
    });

    hook({ id: "req-1" } as any, {} as any, () => {
      store = Context.getStore();
    });

    expect(store).toEqual({ service: "fastify", id: "req-1", rid: "fastify-1" });
  });

  it("runs without a done callback", () => {
    const hook = createAsyncContextFastifyHook({ idFactory: () => "fastify-2" });
    hook({} as any, {} as any);
    expect(Context.getStore()).toBeUndefined();
  });

  it("registers the hook on a fastify-like instance", () => {
    let hookName = "";
    let captured: unknown;
    registerAsyncContextFastify(
      {
        addHook(name, fn) {
          hookName = name;
          captured = fn;
        },
      },
      {}
    );

    expect(hookName).toBe("onRequest");
    expect(typeof captured).toBe("function");
  });
});

describe("Koa integration", () => {
  it("creates middleware that sets context", async () => {
    let store: Record<string, unknown> | undefined;
    const middleware = createAsyncContextKoaMiddleware({
      idFactory: () => "koa-1",
      seed: () => ({ source: "koa" }),
    });

    await middleware({} as any, async () => {
      store = Context.getStore();
    });

    expect(store).toEqual({ source: "koa", instance_id: "koa-1" });
  });
});

describe("Next.js integration", () => {
  it("wraps API handlers and seeds context", async () => {
    let store: Record<string, unknown> | undefined;
    const handler = createAsyncContextNextHandler(
      async (_req, _res) => {
        store = Context.getStore();
      },
      { idKey: "rid", idFactory: () => "next-1", seed: { source: "next" } }
    );

    await handler({} as any, {} as any);

    expect(store).toEqual({ source: "next", rid: "next-1" });
  });
});
