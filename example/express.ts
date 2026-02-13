import express from "express";
import { AsyncContextExpressMiddleware, Context } from "@marceloraineri/async-context";

const app = express();
app.use(AsyncContextExpressMiddleware);

app.get("/ping", (_req, res) => {
  res.json({ instanceId: Context.getValue("instance_id") ?? null });
});

app.listen(3000, () => {
  console.log("listening on http://localhost:3000");
});
