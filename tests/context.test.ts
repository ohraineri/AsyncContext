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
