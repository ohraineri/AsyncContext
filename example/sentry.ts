import {
  Context,
  captureExceptionWithContext,
  initSentryWithAsyncContext,
} from "@marceloraineri/async-context";

async function main() {
  const ok = await initSentryWithAsyncContext({
    sentryInit: { dsn: process.env.SENTRY_DSN },
  });

  if (!ok) {
    console.log("@sentry/node not installed or init unavailable");
    return;
  }

  await Context.run({ requestId: "req_1", tenantId: "t_123" }, async () => {
    await captureExceptionWithContext(new Error("boom"));
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
