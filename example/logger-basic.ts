import { Context, createLogger } from "@marceloraineri/async-context";

const logger = createLogger({
  name: "api",
  level: "info",
  contextKey: "ctx",
  redactKeys: ["ctx.token"],
});

async function main() {
  await Context.run({ requestId: "req_1", token: "secret" }, async () => {
    logger.info("request started", { route: "/ping" });

    const child = logger.child({ job: "import-users" }, { level: "debug" });
    child.debug("child logger active");

    const end = child.startTimer("debug");
    await Promise.resolve();
    end("job completed", { ok: true });
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
