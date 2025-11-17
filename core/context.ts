import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Provides an application-wide asynchronous context using Node.js AsyncLocalStorage.
 * Allows storing and retrieving key/value data within the active async execution flow.
 */
export class Context {
  /**
   * Singleton instance of AsyncLocalStorage.
   * @type {AsyncLocalStorage<unknown>}
   */
  public static asyncLocalStorageInstance: AsyncLocalStorage<unknown>;

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
   * @returns {AsyncLocalStorage<unknown>} The AsyncLocalStorage singleton.
   */
  static getInstance(): AsyncLocalStorage<unknown> {
    if (!Context.asyncLocalStorageInstance) {
      new Context();
    }
    return Context.asyncLocalStorageInstance;
  }

  /**
   * Adds a single key/value pair to the active asynchronous context.
   *
   * @param {string} key - Key to store inside the context.
   * @param {*} value - Value to associate with the given key.
   * @returns {Record<string, any>} The updated context object.
   *
   * @throws {Error} If called outside of an active `Context.getInstance().run()`.
   */
  static addValue(key: string, value: any) {
    const contextObject = Context.getInstance().getStore() as Record<
      string,
      any
    >;
    if (!contextObject)
      throw new Error(
        "No active context found. Use Context.getInstance().run()."
      );

    contextObject[key] = value;
    return contextObject;
  }

  /**
   * Merges an object of values into the active asynchronous context.
   *
   * @param {Record<string, any>} object - Object containing key/value pairs to merge.
   * @returns {Record<string, any>} The merged context object.
   *
   * @throws {Error} If called outside of an active `Context.getInstance().run()`.
   */
  static addObjectValue(object: Record<string, any>) {
    const contextObject = Context.getInstance().getStore();
    if (!contextObject)
      throw new Error(
        "No active context found. Use Context.getInstance().run()."
      );

    const merged = Object.assign(contextObject, object);
    return merged;
  }
}
