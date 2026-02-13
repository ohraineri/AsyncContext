import { Context } from "@marceloraineri/async-context";

async function main() {
  await Context.run({}, async () => {
    await Context.measure(
      "db.query",
      async () => {
        await Promise.resolve();
        return "ok";
      },
      { data: { table: "users" } }
    );

    console.log("perf", Context.getValue("perf"));
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
