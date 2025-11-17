import type * as http from "node:http";
import crypto from "node:crypto";
import { Context } from "../..";

export function AsyncContextExpresssMiddleware(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  next: () => void
) {
  const uuid = crypto.randomUUID();
  const LocalStorageInstance = Context.getInstance();

  LocalStorageInstance.run({ instance_id: uuid }, () => next());
}
