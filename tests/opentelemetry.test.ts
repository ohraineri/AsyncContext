import { describe, expect, it } from "vitest";
import { Context } from "../core/context";
import {
  type OpenTelemetryApi,
  type OpenTelemetrySpanSummary,
  createAsyncContextExpressOpenTelemetryMiddleware,
  extractOpenTelemetryContextFromHeaders,
  getActiveOpenTelemetrySpanContext,
  injectOpenTelemetryContextToHeaders,
  mergeContextFromOpenTelemetryBaggage,
  setOpenTelemetryBaggageFromContext,
  withOpenTelemetrySpan,
} from "../core/integrations/opentelemetry";

type FakeSpan = {
  name: string;
  attributes: Record<string, unknown>;
  status?: { code?: number; message?: string };
  exceptions: unknown[];
  ended: boolean;
  spanContext: () => { traceId: string; spanId: string };
  setAttribute: (key: string, value: unknown) => void;
  setAttributes: (attributes: Record<string, unknown>) => void;
  recordException: (error: unknown) => void;
  setStatus: (status: { code?: number; message?: string }) => void;
  end: () => void;
};

function createFakeOpenTelemetry() {
  let counter = 0;
  const spans: FakeSpan[] = [];

  const tracer = {
    startSpan: (name: string, options?: Record<string, unknown>) => {
      counter += 1;
      const attributes =
        (options?.attributes as Record<string, unknown>) ?? {};
      const span: FakeSpan = {
        name,
        attributes: { ...attributes },
        exceptions: [],
        ended: false,
        spanContext: () => ({
          traceId: `trace-${counter}`,
          spanId: `span-${counter}`,
        }),
        setAttribute: (key, value) => {
          span.attributes[key] = value;
        },
        setAttributes: (attrs) => {
          Object.assign(span.attributes, attrs);
        },
        recordException: (error) => {
          span.exceptions.push(error);
        },
        setStatus: (status) => {
          span.status = status;
        },
        end: () => {
          span.ended = true;
        },
      };
      spans.push(span);
      return span;
    },
  };

  const api: OpenTelemetryApi = {
    context: {
      active: () => ({}),
      with: (_ctx, fn) => fn(),
    },
    trace: {
      getTracer: () => tracer,
      setSpan: (ctx, span) => ({ ...(ctx as object), __span: span }),
      getSpan: (ctx) => (ctx as { __span?: FakeSpan }).__span,
    },
    propagation: {
      createBaggage: (entries) => ({
        getAllEntries: () => entries ?? {},
      }),
      getBaggage: (ctx) => (ctx as { baggage?: { getAllEntries: () => Record<string, unknown> } }).baggage,
      setBaggage: (ctx, baggage) => ({ ...(ctx as object), baggage }),
      extract: (ctx) => ctx,
      inject: () => undefined,
    },
  };

  return { api, spans };
}

function createFakeResponse() {
  const listeners: Record<string, Array<() => void>> = {};

  return {
    statusCode: 200,
    on: (event: string, listener: () => void) => {
      listeners[event] ??= [];
      listeners[event].push(listener);
    },
    once: (event: string, listener: () => void) => {
      listeners[event] ??= [];
      const wrapper = () => {
        listener();
        listeners[event] = (listeners[event] ?? []).filter((item) => item !== wrapper);
      };
      listeners[event].push(wrapper);
    },
    emit: (event: string) => {
      for (const listener of listeners[event] ?? []) {
        listener();
      }
    },
  };
}

describe("OpenTelemetry integration", () => {
  it("records span summaries and context attributes", async () => {
    const { api, spans } = createFakeOpenTelemetry();

    await Context.run({ requestId: "req_1" }, async () => {
      await withOpenTelemetrySpan(
        "job.run",
        async () => {
          return "ok";
        },
        {
          api,
          attributes: { feature: "beta" },
          includeContextAttributes: true,
          contextAttributeKeys: ["requestId"],
          contextAttributePrefix: "ctx.",
        }
      );

      const summaries = Context.getValue("otel") as OpenTelemetrySpanSummary[];
      expect(Array.isArray(summaries)).toBe(true);
      expect(summaries.length).toBe(1);
      expect(summaries[0].name).toBe("job.run");
      expect(summaries[0].traceId).toBe("trace-1");
      expect(summaries[0].attributes?.["ctx.requestId"]).toBe("req_1");
    });

    expect(spans.length).toBe(1);
    expect(spans[0].ended).toBe(true);
  });

  it("records errors and rethrows", async () => {
    const { api } = createFakeOpenTelemetry();

    await Context.run({}, async () => {
      await expect(
        withOpenTelemetrySpan(
          "job.fail",
          async () => {
            throw new Error("boom");
          },
          { api }
        )
      ).rejects.toThrow("boom");

      const summaries = Context.getValue("otel") as OpenTelemetrySpanSummary[];
      expect(summaries[0].error?.message).toBe("boom");
    });
  });

  it("creates spans in express middleware", () => {
    const { api, spans } = createFakeOpenTelemetry();
    const middleware = createAsyncContextExpressOpenTelemetryMiddleware({
      otel: { api },
    });

    const req = { method: "GET", url: "/ping", headers: {} } as any;
    const res = createFakeResponse();
    let summaries: OpenTelemetrySpanSummary[] | undefined;

    middleware(req, res as any, () => {
      res.emit("finish");
      summaries = Context.getValue("otel") as OpenTelemetrySpanSummary[];
    });

    expect(spans.length).toBe(1);
    expect(spans[0].ended).toBe(true);
    expect(summaries?.[0].attributes?.["http.method"]).toBe("GET");
    expect(summaries?.[0].attributes?.["http.status_code"]).toBe(200);
  });

  it("syncs baggage into context", () => {
    const { api } = createFakeOpenTelemetry();

    Context.run({ tenantId: "t_123" }, () => {
      const ctxWithBaggage = setOpenTelemetryBaggageFromContext({
        api,
        contextKeys: ["tenantId"],
        baggagePrefix: "ctx.",
      });

      if (ctxWithBaggage) {
        mergeContextFromOpenTelemetryBaggage({
          api,
          context: ctxWithBaggage,
          baggagePrefix: "ctx.",
          targetKeyPrefix: "otel_",
        });
      }

      expect(Context.getValue("otel_tenantId")).toBe("t_123");
    });
  });

  it("extracts and injects headers using default helpers", () => {
    const seen: { keys?: string[]; value?: string | string[] } = {};
    const api: OpenTelemetryApi = {
      context: {
        active: () => ({ base: true }),
        with: (_ctx, fn) => fn(),
      },
      propagation: {
        extract: (ctx, carrier, getter) => {
          const keys = getter?.keys(carrier) ?? [];
          seen.keys = keys;
          const firstKey = keys[0];
          seen.value = firstKey ? getter?.get(carrier, firstKey) : undefined;
          return { ...(ctx as object), extracted: seen.value };
        },
        inject: (_ctx, carrier, setter) => {
          setter?.set(carrier, "traceparent", "00-abc");
        },
      },
    };

    const headers = { Traceparent: "00-xyz" };
    const extracted = extractOpenTelemetryContextFromHeaders(headers, { api });
    expect(seen.keys).toContain("Traceparent");
    expect(seen.value).toBe("00-xyz");
    expect((extracted as Record<string, unknown>).extracted).toBe("00-xyz");

    const out: Record<string, unknown> = {};
    injectOpenTelemetryContextToHeaders(out, { api });
    expect(out.traceparent).toBe("00-abc");
  });

  it("merges baggage entries and respects overwrite", () => {
    const { api } = createFakeOpenTelemetry();

    const existing = api.propagation?.createBaggage?.({
      "ctx.old": { value: "old" },
    });
    const baseContext = api.propagation?.setBaggage?.({}, existing!);

    Context.run({ tenantId: "t1" }, () => {
      const ctxWithBaggage = setOpenTelemetryBaggageFromContext({
        api,
        context: baseContext,
        contextKeys: ["tenantId"],
        baggagePrefix: "ctx.",
      });

      const baggage = api.propagation?.getBaggage?.(ctxWithBaggage as any);
      expect(baggage?.getAllEntries?.()).toEqual({
        "ctx.old": { value: "old" },
        "ctx.tenantId": { value: "t1" },
      });
    });

    const baggage = api.propagation?.createBaggage?.({
      "ctx.tenantId": { value: "new" },
      "ctx.plan": { value: "pro" },
    });
    const ctx = api.propagation?.setBaggage?.({}, baggage!);

    Context.run({ otel_tenantId: "keep" }, () => {
      mergeContextFromOpenTelemetryBaggage({
        api,
        context: ctx,
        baggagePrefix: "ctx.",
        baggageKeys: ["tenantId"],
        targetKeyPrefix: "otel_",
      });

      expect(Context.getValue("otel_tenantId")).toBe("keep");
      expect(Context.getValue("otel_plan")).toBeUndefined();
    });

    Context.run({ otel_tenantId: "keep" }, () => {
      mergeContextFromOpenTelemetryBaggage({
        api,
        context: ctx,
        baggagePrefix: "ctx.",
        targetKeyPrefix: "otel_",
        mode: "overwrite",
      });

      expect(Context.getValue("otel_tenantId")).toBe("new");
      expect(Context.getValue("otel_plan")).toBe("pro");
    });
  });

  it("returns active span context when available", () => {
    const span = {
      spanContext: () => ({ traceId: "trace-1", spanId: "span-1" }),
    };
    const api: OpenTelemetryApi = {
      context: {
        active: () => ({ __span: span }),
        with: (_ctx, fn) => fn(),
      },
      trace: {
        getTracer: () => ({
          startSpan: () => span,
        }),
        getSpan: (ctx) => (ctx as { __span?: typeof span }).__span,
      },
    };

    const active = getActiveOpenTelemetrySpanContext(api);
    expect(active).toEqual({ traceId: "trace-1", spanId: "span-1" });
  });
});
