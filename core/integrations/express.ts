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
 * Creates an Express middleware that initializes a new async context per request.
 * A unique request id is generated and stored under `idKey`.
 *
 * @param {AsyncContextExpressOptions} [options] - Middleware options.
 * @returns Express middleware that seeds the async context.
 *
 * @example
 * ```ts
 * import express from "express";
 * import { createAsyncContextExpressMiddleware } from "@marceloraineri/async-context";
 *
 * const app = express();
 * app.use(
 *   createAsyncContextExpressMiddleware({
 *     idKey: "request_id",
 *     seed: (req) => ({ method: req.method, path: req.url }),
 *   })
 * );
 * ```
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

/**
 * Express middleware that initializes a new async context per request
 * with default options.
 *
 * @example
 * ```ts
 * app.use(AsyncContextExpressMiddleware);
 * ```
 */
export function AsyncContextExpresssMiddleware(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  next: () => void
) {
  return defaultExpressMiddleware(req, res, next);
}

/**
 * Alias for `AsyncContextExpresssMiddleware`.
 *
 * @example
 * ```ts
 * app.use(AsyncContextExpressMiddleware);
 * ```
 */
export const AsyncContextExpressMiddleware = AsyncContextExpresssMiddleware;
