import { describe, expect, it } from "vitest";
import { Context } from "../core/context";

describe("Context", () => {
  it("returns a singleton instance", () => {
    const first = Context.getInstance();
    const second = Context.getInstance();
    expect(first).toBe(second);
  });

  it("runs without explicit store", () => {
    let store: Record<string, unknown> | undefined;
    Context.run(() => {
      store = Context.getStore();
    });
    expect(store).toBeDefined();
    expect(store && Object.keys(store).length).toBe(0);
  });

  it("runs with an initial store", () => {
    Context.run({ foo: "bar" }, () => {
      expect(Context.getValue("foo")).toBe("bar");
    });
  });

  it("throws when run is missing a callback", () => {
    expect(() => (Context.run as unknown as (store: {}) => void)({})).toThrow(
      "Context.run requires a callback"
    );
  });

  it("throws when requireStore is called outside a context", () => {
    expect(() => Context.requireStore()).toThrow("No active context found");
  });

  it("returns undefined store outside a context", () => {
    expect(Context.getStore()).toBeUndefined();
    expect(Context.snapshot()).toBeUndefined();
    expect(Context.has("missing")).toBe(false);
  });

  it("addValue and addObjectValue mutate the store", () => {
    Context.run({ base: true }, () => {
      Context.addValue("user", { id: 1 });
      Context.addObjectValue({ token: "abc" });
      const store = Context.getStore() as Record<string, unknown>;
      expect(store.base).toBe(true);
      expect(store.user).toEqual({ id: 1 });
      expect(store.token).toBe("abc");
    });
  });

  it("addOptions merges into an options bag", () => {
    Context.run({ base: true }, () => {
      Context.addOptions({ feature: true });
      Context.addOptions({ level: "debug" });
      const store = Context.getStore() as Record<string, unknown>;
      expect(store.base).toBe(true);
      expect(store.options).toEqual({ feature: true, level: "debug" });
    });
  });

  it("addOptions supports a custom key and validates existing value", () => {
    Context.run({ config: { retry: 1 } }, () => {
      Context.addOptions({ retry: 2, timeout: 500 }, "config");
      expect(Context.getValue("config")).toEqual({ retry: 2, timeout: 500 });
    });

    Context.run({ options: "not-an-object" }, () => {
      expect(() => Context.addOptions({ ok: true })).toThrow(
        "Context value \"options\" is not an object."
      );
    });
  });

  it("measure records performance data for sync work", () => {
    Context.run({}, () => {
      const result = Context.measure(
        "sync.work",
        () => {
          return "ok";
        },
        { data: { stage: "test" } }
      );

      expect(result).toBe("ok");
      const perf = Context.getValue("perf") as Array<Record<string, unknown>>;
      expect(Array.isArray(perf)).toBe(true);
      expect(perf.length).toBe(1);
      expect(perf[0].name).toBe("sync.work");
      expect(perf[0].data).toEqual({ stage: "test" });
      expect(perf[0].durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  it("measure records performance data for async work and errors", async () => {
    await Context.run({}, async () => {
      await Context.measure("async.work", async () => {
        await Promise.resolve();
      });

      await expect(
        Context.measure("async.fail", async () => {
          throw new Error("boom");
        })
      ).rejects.toThrow("boom");

      const perf = Context.getValue("perf") as Array<Record<string, unknown>>;
      expect(perf.length).toBe(2);
      expect(perf[0].name).toBe("async.work");
      expect(perf[1].name).toBe("async.fail");
      expect(perf[1].error).toEqual({ name: "Error", message: "boom" });
    });
  });

  it("remove and safeRemove behave correctly", () => {
    Context.run({ token: "abc" }, () => {
      Context.remove("token");
      expect(Context.has("token")).toBe(false);
      Context.addValue("token", "abc");
      Context.safeRemove("token");
      expect(Context.has("token")).toBe(false);
      expect(() => Context.safeRemove("missing")).toThrow(
        "You are trying to remove something that does not exist."
      );
    });
  });

  it("getValue/requireValue and setDefault work", () => {
    Context.run({ existing: "value" }, () => {
      expect(Context.getValue("existing")).toBe("value");
      expect(Context.getValue("missing", "fallback")).toBe("fallback");
      expect(Context.requireValue("existing")).toBe("value");
      expect(() => Context.requireValue("missing")).toThrow(
        "Context value \"missing\" was not found."
      );

      Context.setDefault("existing", "new");
      Context.setDefault("newKey", 42);
      expect(Context.getValue("existing")).toBe("value");
      expect(Context.getValue("newKey")).toBe(42);
    });
  });

  it("does not apply default when key exists but is undefined", () => {
    Context.run({ empty: undefined }, () => {
      expect(Context.getValue("empty", "fallback")).toBeUndefined();
    });
  });

  it("snapshot and reset behave as expected", () => {
    Context.run({ a: 1, b: 2 }, () => {
      const snapshot = Context.snapshot();
      expect(snapshot).toEqual({ a: 1, b: 2 });
      expect(snapshot).not.toBe(Context.getStore());
      Context.reset();
      expect(Context.getStore()).toEqual({});
    });
  });

  it("runWith creates a child context", () => {
    Context.run({ parent: true }, () => {
      Context.runWith({ child: true }, () => {
        expect(Context.getStore()).toEqual({ parent: true, child: true });
      });

      expect(Context.getStore()).toEqual({ parent: true });
    });
  });

  it("enterWith swaps the active store", () => {
    Context.run({ before: true }, () => {
      Context.enterWith({ after: true });
      expect(Context.getStore()).toEqual({ after: true });
    });
  });
});
