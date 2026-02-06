import { describe, expect, it } from "vitest";
import { Context } from "../core/context";
import {
  createConsoleTransport,
  createLogger,
  type LogEntry,
} from "../core/logging/logger";
import { Writable } from "node:stream";

type Transport = (entry: LogEntry) => void;

function createMemoryTransport(entries: LogEntry[]): Transport {
  return (entry) => {
    entries.push(entry);
  };
}

class CaptureStream extends Writable {
  public chunks: string[] = [];
  _write(chunk: unknown, _enc: string, next: (error?: Error | null) => void) {
    this.chunks.push(String(chunk));
    next();
  }
}

describe("Logger", () => {
  it("logs messages, data, and errors", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger({ transport: createMemoryTransport(entries), level: "trace", context: false });

    logger.info("hello", { foo: "bar" });
    logger.error(new Error("boom"), "failed", { code: 500 });
    logger.warn("oops", new Error("broken"));
    logger.debug({ list: [1, 2] }, "payload");
    logger.error("bad", { foo: "bar" }, "string error");
    logger.error({ foo: "bar" }, new Error("boom"));

    expect(entries[0].message).toBe("hello");
    expect(entries[0].data?.foo).toBe("bar");

    expect(entries[1].message).toBe("failed");
    expect(entries[1].error?.message).toBe("boom");
    expect(entries[1].data?.code).toBe(500);

    expect(entries[2].message).toBe("oops");
    expect(entries[2].error?.message).toBe("broken");

    expect(entries[3].message).toBe("payload");
    expect(entries[3].data?.list).toEqual([1, 2]);

    expect(entries[4].error?.message).toBe("string error");

    expect(entries[5].error?.message).toBe("boom");
    expect(entries[5].data?.foo).toBe("bar");
  });

  it("supports context attachment and allowlists", async () => {
    const entries: LogEntry[] = [];
    const logger = createLogger({
      transport: createMemoryTransport(entries),
      level: "info",
      context: true,
      contextKey: "ctx",
      contextKeys: ["requestId"],
    });

    await Context.run({ requestId: "req-1", user: "ada" }, async () => {
      logger.info("contextual");
    });

    expect(entries[0].ctx).toEqual({ requestId: "req-1" });
  });

  it("can disable context", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger({ transport: createMemoryTransport(entries), context: false });

    Context.run({ requestId: "req-2" }, () => {
      logger.info("no-context");
    });

    expect(entries[0].context).toBeUndefined();
  });

  it("redacts sensitive fields by default and supports custom redaction", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger({
      transport: createMemoryTransport(entries),
      level: "info",
      context: false,
      redactFieldNames: ["creditCard"],
      redactPlaceholder: "***",
    });

    logger.info("redact", {
      password: "secret",
      nested: { token: "tok", safe: "ok" },
      creditCard: "4111",
    });

    const data = entries[0].data as Record<string, unknown>;
    expect(data.password).toBe("***");
    expect((data.nested as Record<string, unknown>).token).toBe("***");
    expect(data.creditCard).toBe("***");
  });

  it("supports path-based redaction and wildcards", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger({
      transport: createMemoryTransport(entries),
      level: "info",
      context: false,
      redactDefaults: false,
      redactKeys: ["data.secret", "data.items.*.secret"],
    });

    logger.info({
      password: "keep",
      secret: "hide",
      items: [{ secret: "a" }, { secret: "b" }],
    });

    const data = entries[0].data as Record<string, unknown>;
    expect(data.password).toBe("keep");
    expect(data.secret).toBe("[REDACTED]");
    expect((data.items as Array<Record<string, unknown>>)[0].secret).toBe(
      "[REDACTED]"
    );
  });

  it("handles bindings, child loggers, and sampling", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger({
      transport: createMemoryTransport(entries),
      level: "info",
      bindings: { service: "api" },
      context: false,
    });

    logger.info("hello");

    const child = logger.child({ requestId: "req-1" });
    child.info("child");

    const sampled = createLogger({
      transport: createMemoryTransport(entries),
      level: "info",
      sampleRate: 0,
      context: false,
    });
    sampled.info("skip");

    expect(entries[0].bindings).toEqual({ service: "api" });
    expect(entries[1].bindings).toEqual({ service: "api", requestId: "req-1" });
    expect(entries.length).toBe(2);
  });

  it("supports timers", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger({ transport: createMemoryTransport(entries), level: "debug", context: false });

    const end = logger.startTimer("debug");
    end("done", { job: true });

    expect(entries[0].duration_ms).toBeTypeOf("number");
    expect(entries[0].data?.job).toBe(true);
  });

  it("handles normalizeValue for common types", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger({ transport: createMemoryTransport(entries), level: "info", context: false });

    const circular: Record<string, unknown> = { name: "root" };
    circular.self = circular;

    logger.info({
      map: new Map([["a", 1]]),
      set: new Set([1, 2]),
      when: new Date("2020-01-01T00:00:00.000Z"),
      big: BigInt(10),
      fn: function example() {
        return "ok";
      },
      circular,
    });

    const data = entries[0].data as Record<string, unknown>;
    expect((data.map as Record<string, unknown>).a).toBe(1);
    expect(data.set).toEqual([1, 2]);
    expect(data.when).toBe("2020-01-01T00:00:00.000Z");
    expect(data.big).toBe("10");
    expect(String(data.fn)).toContain("Function");
    const circularData = data.circular as Record<string, unknown>;
    expect(circularData.self).toBe("[Circular]");
  });

  it("supports console transport formats", () => {
    const stream = new CaptureStream();
    const transport = createConsoleTransport({ format: "json", stream });
    transport({ level: "info", levelValue: 30, message: "hello" });

    const prettyStream = new CaptureStream();
    const prettyTransport = createConsoleTransport({ format: "pretty", stream: prettyStream, colors: false });
    prettyTransport({ level: "warn", levelValue: 40, message: "warn", timestamp: "2020-01-01T00:00:00.000Z" });

    expect(stream.chunks[0]).toContain("\"message\":\"hello\"");
    expect(prettyStream.chunks[0]).toContain("WARN");

    const defaultTransport = createConsoleTransport({ format: "json", stderrLevels: ["info"] });
    defaultTransport({ level: "info", levelValue: 30, message: "stderr" });
  });

  it("supports level filtering", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger({ transport: createMemoryTransport(entries), level: "error", context: false });

    logger.info("skip");
    logger.error("emit");

    expect(entries.length).toBe(1);
    expect(entries[0].message).toBe("emit");
  });
});
