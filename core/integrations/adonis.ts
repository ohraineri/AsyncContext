import crypto from "node:crypto";
import { Context } from "../context";

type NextFunction = () => Promise<unknown>;
type AdonisContext = Record<string, unknown>;

/**
 * AdonisJS middleware that initializes a new asynchronous context
 * for each incoming request.
 *
 * Compatible with AdonisJS' middleware signature:
 * `async handle(ctx, next)`.
 */
export class AsyncContextAdonisMiddleware {
  async handle(_ctx: AdonisContext, next: NextFunction) {
    const uuid = crypto.randomUUID();
    const localStorageInstance = Context.getInstance();

    return localStorageInstance.run({ instance_id: uuid }, () => next());
  }
}
