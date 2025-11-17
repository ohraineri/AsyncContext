import type * as http from "node:http";
import crypto from "node:crypto";
import { Context } from "../..";

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
 *   const context = Context.getInstance().getStore();
 *   console.log(context.instance_id); // Unique per request
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

export function AsyncContextExpresssMiddleware(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  next: () => void
) {
  const uuid = crypto.randomUUID();
  const LocalStorageInstance = Context.getInstance();

  LocalStorageInstance.run({ instance_id: uuid }, () => next());
}
