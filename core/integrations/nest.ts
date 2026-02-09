import { AsyncContextExpressMiddleware } from "./express";

type NextFunction = () => void;

/**
 * Nest middleware that reuses the Express integration to initialize
 * a new asynchronous context for each incoming request.
 *
 * Works with the default Nest Express adapter.
 *
 * @example
 * ```ts
 * import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
 * import { AsyncContextNestMiddleware } from "@marceloraineri/async-context";
 *
 * @Module({})
 * export class AppModule implements NestModule {
 *   configure(consumer: MiddlewareConsumer) {
 *     consumer.apply(AsyncContextNestMiddleware).forRoutes("*");
 *   }
 * }
 * ```
 */
export class AsyncContextNestMiddleware {
  /**
   * Nest middleware entrypoint.
   *
   * @example
   * ```ts
   * // Called by Nest at runtime.
   * ```
   */
  use(req: unknown, res: unknown, next: NextFunction) {
    AsyncContextExpressMiddleware(
      req as Parameters<typeof AsyncContextExpressMiddleware>[0],
      res as Parameters<typeof AsyncContextExpressMiddleware>[1],
      next
    );
  }
}
