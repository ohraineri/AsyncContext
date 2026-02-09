import { AsyncLocalStorage } from "node:async_hooks";

export type ContextStore = Record<string, any>;

export type PerformanceError = {
  name?: string;
  message: string;
};

export type PerformanceEntry = {
  name: string;
  durationMs: number;
  startedAt: number;
  endedAt: number;
  data?: Record<string, unknown>;
  error?: PerformanceError;
};

export type PerformanceRecordOptions = {
  key?: string;
  mode?: "append" | "overwrite";
};

export type PerformanceMeasureOptions = PerformanceRecordOptions & {
  data?: Record<string, unknown>;
  now?: () => number;
};

/**
 * Provides an application-wide asynchronous context using Node.js AsyncLocalStorage.
 * Allows storing and retrieving key/value data within the active async execution flow.
 */
export class Context {
  /**
   * Singleton instance of AsyncLocalStorage.
   * @type {AsyncLocalStorage<ContextStore>}
   */
  public static asyncLocalStorageInstance: AsyncLocalStorage<ContextStore>;

  /**
   * Private constructor initializes the AsyncLocalStorage instance.
   * Called automatically when the instance does not yet exist.
   * @private
   */
  private constructor() {
    Context.asyncLocalStorageInstance = new AsyncLocalStorage();
  }

  /**
   * Returns the global AsyncLocalStorage instance, creating it if necessary.
   *
   * @returns {AsyncLocalStorage<ContextStore>} The AsyncLocalStorage singleton.
   */
  static getInstance(): AsyncLocalStorage<ContextStore> {
    if (!Context.asyncLocalStorageInstance) {
      new Context();
    }
    return Context.asyncLocalStorageInstance;
  }

  /**
   * Returns the current context store, if any.
   */
  static getStore<T extends ContextStore = ContextStore>(): T | undefined {
    return Context.getInstance().getStore() as T | undefined;
  }

  /**
   * Returns the current context store, throwing when none exists.
   *
   * @throws {Error} If called outside of an active context.
   */
  static requireStore<T extends ContextStore = ContextStore>(): T {
    const contextObject = Context.getStore<T>();
    if (!contextObject)
      throw new Error(
        "No active context found. Use Context.run(...) or the context middleware."
      );
    return contextObject;
  }

  /**
   * Runs the provided callback inside a new async context.
   */
  static run<T>(callback: () => T): T;
  static run<T>(initialStore: ContextStore, callback: () => T): T;
  static run<T>(
    initialStoreOrCallback: ContextStore | (() => T),
    maybeCallback?: () => T
  ): T {
    const initialStore =
      typeof initialStoreOrCallback === "function" ? {} : initialStoreOrCallback;
    const callback =
      typeof initialStoreOrCallback === "function"
        ? initialStoreOrCallback
        : maybeCallback;

    if (!callback) {
      throw new Error("Context.run requires a callback.");
    }

    return Context.getInstance().run(initialStore ?? {}, callback);
  }

  /**
   * Runs the callback inside a new child context derived from the current store.
   * Useful for creating a scoped overlay without mutating the parent store.
   */
  static runWith<T>(values: ContextStore, callback: () => T): T {
    const parentStore = Context.getStore<ContextStore>();
    const baseStore = parentStore ? { ...parentStore } : {};
    return Context.getInstance().run({ ...baseStore, ...values }, callback);
  }

  /**
   * Enters the given store for the current execution (advanced usage).
   */
  static enterWith(store: ContextStore): void {
    Context.getInstance().enterWith(store);
  }

  /**
   * Returns a shallow copy of the active store, or undefined when no context exists.
   */
  static snapshot<T extends ContextStore = ContextStore>(): T | undefined {
    const contextObject = Context.getStore<T>();
    if (!contextObject) return undefined;
    return { ...contextObject };
  }

  /**
   * Returns the value for a key in the active context.
   */
  static getValue<T = unknown>(key: string, defaultValue?: T): T | undefined {
    const contextObject = Context.getStore();
    if (!contextObject) return defaultValue;
    if (Object.prototype.hasOwnProperty.call(contextObject, key)) {
      return contextObject[key] as T;
    }
    return defaultValue;
  }

  /**
   * Returns the value for a key, throwing if it does not exist.
   */
  static requireValue<T = unknown>(key: string): T {
    const contextObject = Context.requireStore();
    if (!Object.prototype.hasOwnProperty.call(contextObject, key)) {
      throw new Error(`Context value "${key}" was not found.`);
    }
    return contextObject[key] as T;
  }

  /**
   * Returns true when the active context has the given key.
   */
  static has(key: string): boolean {
    const contextObject = Context.getStore();
    return (
      !!contextObject && Object.prototype.hasOwnProperty.call(contextObject, key)
    );
  }

  /**
   * Sets a value only when the key is currently missing.
   */
  static setDefault<T = unknown>(key: string, value: T): T {
    const contextObject = Context.requireStore();
    if (!Object.prototype.hasOwnProperty.call(contextObject, key)) {
      contextObject[key] = value;
    }
    return contextObject[key] as T;
  }

  /**
   * Clears all keys from the active context store.
   */
  static reset(): ContextStore {
    const contextObject = Context.requireStore();
    for (const key of Object.keys(contextObject)) {
      delete contextObject[key];
    }
    return contextObject;
  }

  /**
   * Adds a single key/value pair to the active asynchronous context.
   *
   * @param {string} key - Key to store inside the context.
   * @param {*} value - Value to associate with the given key.
   * @returns {Record<string, any>} The updated context object.
   *
   * @throws {Error} If called outside of an active `Context.run(...)`.
   */
  static addValue(key: string, value: any): ContextStore {
    const contextObject = Context.requireStore();
    contextObject[key] = value;
    return contextObject;
  }

  /**
   * Merges an object of values into the active asynchronous context.
   *
   * @param {Record<string, any>} object - Object containing key/value pairs to merge.
   * @returns {Record<string, any>} The merged context object.
   *
   * @throws {Error} If called outside of an active `Context.run(...)`.
   */
  static addObjectValue(object: Record<string, any>): ContextStore {
    const contextObject = Context.requireStore();
    return Object.assign(contextObject, object) as ContextStore;
  }

  /**
   * Merges an options object into the active context.
   * Creates the options bag when it does not exist.
   *
   * @param {Record<string, any>} options - Options to merge into the context.
   * @param {string} key - Optional key name for the options bag.
   * @returns {Record<string, any>} The updated context object.
   *
   * @throws {Error} If called outside of an active `Context.run(...)`.
   * @throws {Error} If the existing options bag is not an object.
   */
  static addOptions(options: Record<string, any>, key = "options"): ContextStore {
    const contextObject = Context.requireStore();
    const existing = contextObject[key];

    if (existing === undefined) {
      contextObject[key] = { ...options };
      return contextObject;
    }

    if (existing && typeof existing === "object" && !Array.isArray(existing)) {
      Object.assign(existing as Record<string, any>, options);
      return contextObject;
    }

    throw new Error(`Context value "${key}" is not an object.`);
  }

  /**
   * Records a performance entry in the active context.
   */
  static recordPerformance(
    entry: PerformanceEntry,
    options: PerformanceRecordOptions = {}
  ): void {
    const contextObject = Context.getStore<Record<string, unknown>>();
    if (!contextObject) return;

    const key = options.key ?? "perf";
    const mode = options.mode ?? "append";

    if (mode === "overwrite") {
      contextObject[key] = entry;
      return;
    }

    const existing = contextObject[key];
    if (Array.isArray(existing)) {
      existing.push(entry);
      return;
    }

    if (existing === undefined) {
      contextObject[key] = [entry];
      return;
    }

    contextObject[key] = [existing, entry];
  }

  /**
   * Measures sync/async work and stores the timing in the active context.
   */
  static measure<T>(
    name: string,
    callback: () => T,
    options: PerformanceMeasureOptions = {}
  ): T {
    const now = options.now ?? Date.now;
    const startedAt = now();

    const finalize = (error?: unknown) => {
      const endedAt = now();
      const entry: PerformanceEntry = {
        name,
        startedAt,
        endedAt,
        durationMs: Math.max(0, endedAt - startedAt),
      };

      if (options.data) {
        entry.data = { ...options.data };
      }

      if (error) {
        entry.error = normalizePerformanceError(error);
      }

      Context.recordPerformance(entry, options);
    };

    try {
      const result = callback();
      if (isPromiseLike(result)) {
        return (result
          .then((value) => {
            finalize();
            return value;
          })
          .catch((error) => {
            finalize(error);
            throw error;
          })) as T;
      }
      finalize();
      return result;
    } catch (error) {
      finalize(error);
      throw error;
    }
  }

  static remove(key: string): ContextStore {
    const contextObject = Context.requireStore();
    if (Object.prototype.hasOwnProperty.call(contextObject, key)) {
      delete contextObject[key];
    }
    return contextObject;
  }

  static safeRemove(key: string): ContextStore {
    const contextObject = Context.requireStore();
    if (!Object.prototype.hasOwnProperty.call(contextObject, key)) {
      throw new Error(
        "You are trying to remove something that does not exist."
      );
    }
    delete contextObject[key];
    return contextObject;
  }
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return !!value && typeof (value as Promise<T>).then === "function";
}

function normalizePerformanceError(error: unknown): PerformanceError {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  if (typeof error === "string") {
    return { message: error };
  }
  if (error && typeof error === "object") {
    const maybe = error as { message?: unknown; name?: unknown };
    const message =
      typeof maybe.message === "string" ? maybe.message : "Unknown error";
    const name = typeof maybe.name === "string" ? maybe.name : undefined;
    return { name, message };
  }
  return { message: String(error) };
}
