import crypto from "node:crypto";
import { Context, type ContextStore } from "../context";

export type FastifyRequestLike = {
  id?: string;
  raw?: { method?: string; url?: string; headers?: Record<string, unknown> };
};

export type FastifyReplyLike = {
  getHeader?: (name: string) => unknown;
};

export type FastifyDone = (err?: Error) => void;

export type AsyncContextFastifySeed<Req, Reply> =
  | ContextStore
  | ((req: Req, reply: Reply) => ContextStore);

export type AsyncContextFastifyOptions<
  Req = FastifyRequestLike,
  Reply = FastifyReplyLike
> = {
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
  seed?: AsyncContextFastifySeed<Req, Reply>;
};

export type FastifyHook<Req = FastifyRequestLike, Reply = FastifyReplyLike> = (
  request: Req,
  reply: Reply,
  done?: FastifyDone
) => void | Promise<void>;

/**
 * Creates a Fastify `onRequest` hook that initializes AsyncContext.
 *
 * @example
 * ```ts
 * import fastify from "fastify";
 * import { createAsyncContextFastifyHook } from "@marceloraineri/async-context";
 *
 * const app = fastify();
 * app.addHook("onRequest", createAsyncContextFastifyHook());
 * ```
 */
export function createAsyncContextFastifyHook<
  Req = FastifyRequestLike,
  Reply = FastifyReplyLike
>(options: AsyncContextFastifyOptions<Req, Reply> = {}): FastifyHook<Req, Reply> {
  const { idKey = "instance_id", idFactory = () => crypto.randomUUID(), seed } =
    options;

  return function asyncContextFastifyHook(
    request: Req,
    reply: Reply,
    done?: FastifyDone
  ) {
    const seedValue = typeof seed === "function" ? seed(request, reply) : seed;
    const store: ContextStore = {
      ...(seedValue ?? {}),
      [idKey]: idFactory(),
    };

    const runner = () => {
      if (done) return done();
    };

    return Context.getInstance().run(store, runner);
  };
}

/**
 * Convenience helper to register the hook with a Fastify-like instance.
 *
 * @example
 * ```ts
 * import fastify from "fastify";
 * import { registerAsyncContextFastify } from "@marceloraineri/async-context";
 *
 * const app = fastify();
 * registerAsyncContextFastify(app);
 * ```
 */
export function registerAsyncContextFastify<
  Req = FastifyRequestLike,
  Reply = FastifyReplyLike
>(
  fastify: { addHook: (hook: string, fn: FastifyHook<Req, Reply>) => void },
  options: AsyncContextFastifyOptions<Req, Reply> = {}
) {
  fastify.addHook("onRequest", createAsyncContextFastifyHook(options));
}
