import type { NextApiRequest, NextApiResponse } from "next";
import { Context, createAsyncContextNextHandler } from "@marceloraineri/async-context";

export default createAsyncContextNextHandler(
  async (_req: NextApiRequest, res: NextApiResponse) => {
    res.status(200).json({ instanceId: Context.getValue("instance_id") ?? null });
  }
);
