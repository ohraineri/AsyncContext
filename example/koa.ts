import Koa from "koa";
import { Context, createAsyncContextKoaMiddleware } from "@marceloraineri/async-context";

const app = new Koa();
app.use(createAsyncContextKoaMiddleware());

app.use(async (ctx) => {
  ctx.body = { instanceId: Context.getValue("instance_id") ?? null };
});

app.listen(3000, () => {
  console.log("listening on http://localhost:3000");
});
