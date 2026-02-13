import fastify from "fastify";
import { Context, createAsyncContextFastifyHook } from "@marceloraineri/async-context";

const app = fastify();
app.addHook("onRequest", createAsyncContextFastifyHook());

app.get("/ping", async () => ({ instanceId: Context.getValue("instance_id") ?? null }));

app.listen({ port: 3000 }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`listening on ${address}`);
});
