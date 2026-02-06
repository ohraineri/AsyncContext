import crypto from "node:crypto";
import { Context, type ContextStore } from "../context";

export type KoaContextLike = {
  request?: { method?: string; url?: string; headers?: Record<string, unknown> };
  req?: { method?: string; url?: string; headers?: Record<string, unknown> };
};

export type KoaNext = () => Promise<unknown>;

export type AsyncContextKoaSeed<Ctx> =
  | ContextStore
  | ((ctx: Ctx) => ContextStore);

export type AsyncContextKoaOptions<Ctx = KoaContextLike> = {
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
  seed?: AsyncContextKoaSeed<Ctx>;
};

export type KoaMiddleware<Ctx = KoaContextLike> = (
  ctx: Ctx,
  next: KoaNext
) => Promise<unknown>;

/**
 * Creates a Koa middleware that initializes AsyncContext per request.
 */
export function createAsyncContextKoaMiddleware<Ctx = KoaContextLike>(
  options: AsyncContextKoaOptions<Ctx> = {}
): KoaMiddleware<Ctx> {
  const { idKey = "instance_id", idFactory = () => crypto.randomUUID(), seed } =
    options;

  return async function asyncContextKoaMiddleware(ctx: Ctx, next: KoaNext) {
    const seedValue = typeof seed === "function" ? seed(ctx) : seed;
    const store: ContextStore = {
      ...(seedValue ?? {}),
      [idKey]: idFactory(),
    };

    return Context.getInstance().run(store, () => next());
  };
}
