import { AsyncContextExpresssMiddleware } from "./express";

type NextFunction = () => void;

/**
 * Nest middleware that reuses the Express integration to initialize
 * a new asynchronous context for each incoming request.
 *
 * Works with the default Nest Express adapter.
 */
export class AsyncContextNestMiddleware {
  use(req: unknown, res: unknown, next: NextFunction) {
    AsyncContextExpresssMiddleware(
      req as Parameters<typeof AsyncContextExpresssMiddleware>[0],
      res as Parameters<typeof AsyncContextExpresssMiddleware>[1],
      next
    );
  }
}
