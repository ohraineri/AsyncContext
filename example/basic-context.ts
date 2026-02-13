import crypto from "node:crypto";
import { Context } from "@marceloraineri/async-context";

async function main() {
  await Context.run({ requestId: crypto.randomUUID() }, async () => {
    Context.addValue("userId", 42);
    Context.addOptions({ feature: "beta", retry: 2 });

    const snapshot = Context.snapshot();
    console.log("snapshot", snapshot);

    await Promise.resolve();
    console.log("requestId", Context.getValue("requestId"));
    console.log("userId", Context.getValue("userId"));
  });

  // run without an initial store
  Context.run(() => {
    Context.addValue("job", "cleanup");
    console.log("job", Context.getValue("job"));
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
