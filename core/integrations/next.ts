import type * as http from "node:http";
import crypto from "node:crypto";
import { Context, type ContextStore } from "../context";

export type NextApiHandler<
  Req extends http.IncomingMessage = http.IncomingMessage,
  Res extends http.ServerResponse = http.ServerResponse
> = (req: Req, res: Res) => unknown | Promise<unknown>;

export type AsyncContextNextSeed<Req, Res> =
  | ContextStore
  | ((req: Req, res: Res) => ContextStore);

export type AsyncContextNextOptions<Req, Res> = {
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
  seed?: AsyncContextNextSeed<Req, Res>;
};

/**
 * Wraps a Next.js API route handler to initialize AsyncContext per request.
 */
export function createAsyncContextNextHandler<
  Req extends http.IncomingMessage,
  Res extends http.ServerResponse
>(
  handler: NextApiHandler<Req, Res>,
  options: AsyncContextNextOptions<Req, Res> = {}
) {
  const { idKey = "instance_id", idFactory = () => crypto.randomUUID(), seed } =
    options;

  return function asyncContextNextHandler(req: Req, res: Res) {
    const seedValue = typeof seed === "function" ? seed(req, res) : seed;
    const store: ContextStore = {
      ...(seedValue ?? {}),
      [idKey]: idFactory(),
    };

    return Context.getInstance().run(store, () => handler(req, res));
  };
}
