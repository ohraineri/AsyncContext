import type * as http from "node:http";
import crypto from "node:crypto";
import { Context, type ContextStore } from "../context";

export type AsyncContextExpressSeed =
  | ContextStore
  | ((
      req: http.IncomingMessage,
      res: http.ServerResponse
    ) => ContextStore);

export type AsyncContextExpressOptions = {
  /**
   * Key used to store the request identifier.
   * @default "instance_id"
   */
  idKey?: string;
  /**
   * Factory responsible for generating request identifiers.
   * @default crypto.randomUUID
   */
  idFactory?: () => string;
  /**
   * Optional seed object (or factory) to merge into the store.
   */
  seed?: AsyncContextExpressSeed;
};

/**
 * Express middleware that initializes a new asynchronous context
 * for each incoming request.  
 *
 * This middleware assigns a unique `instance_id` (UUID) to the
 * request lifecycle and stores it inside AsyncLocalStorage,
 * allowing the application to later retrieve per-request data
 * without passing parameters through function calls.
 *
 * It is designed to simplify building request-scoped state,
 * such as logging correlation IDs or storing metadata across
 * asynchronous operations.
 *
 * @function AsyncContextExpressMiddleware
 *
 * @param {http.IncomingMessage} req - The current HTTP request.
 * @param {http.ServerResponse} res - The current HTTP response.
 * @param {Function} next - Express continuation callback.
 *
 * @example
 * // Usage in an Express application
 * import express from "express";
 * import { AsyncContextExpressMiddleware } from "@marceloraineri/async-context";
 *
 * const app = express();
 *
 * app.use(AsyncContextExpressMiddleware);
 *
 * app.get("/test", (req, res) => {
 *   const context = Context.getStore();
 *   console.log(context?.instance_id); // Unique per request
 *   res.send("OK");
 * });
 *
 * @description
 * A new asynchronous context is created via:
 * `Context.getInstance().run({ instance_id: <uuid> }, ...)`
 *
 * This ensures that all async operations inside the request
 * share the same context object until the request completes.
 */

export function createAsyncContextExpressMiddleware(
  options: AsyncContextExpressOptions = {}
) {
  const { idKey = "instance_id", idFactory = () => crypto.randomUUID(), seed } =
    options;

  return function asyncContextExpressMiddleware(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    next: () => void
  ) {
    const seedValue = typeof seed === "function" ? seed(req, res) : seed;
    const store: ContextStore = {
      ...(seedValue ?? {}),
      [idKey]: idFactory(),
    };

    Context.getInstance().run(store, () => next());
  };
}

const defaultExpressMiddleware = createAsyncContextExpressMiddleware();

export function AsyncContextExpresssMiddleware(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  next: () => void
) {
  return defaultExpressMiddleware(req, res, next);
}

export const AsyncContextExpressMiddleware = AsyncContextExpresssMiddleware;
