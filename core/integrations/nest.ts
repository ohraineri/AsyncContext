import { AsyncContextExpressMiddleware } from "./express";

type NextFunction = () => void;

/**
 * Nest middleware that reuses the Express integration to initialize
 * a new asynchronous context for each incoming request.
 *
 * Works with the default Nest Express adapter.
 */
export class AsyncContextNestMiddleware {
  use(req: unknown, res: unknown, next: NextFunction) {
    AsyncContextExpressMiddleware(
      req as Parameters<typeof AsyncContextExpressMiddleware>[0],
      res as Parameters<typeof AsyncContextExpressMiddleware>[1],
      next
    );
  }
}
