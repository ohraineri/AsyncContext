import {
  Context,
  createLoggerFromEnv,
  loggerPreset,
} from "@marceloraineri/async-context";

const logger = createLoggerFromEnv({
  name: "billing-api",
  defaults: loggerPreset("production"),
  onWarning: (warning) => {
    console.warn(`[logger-env] ${warning.key}: ${warning.reason}`, {
      value: warning.value,
    });
  },
});

async function handleCheckout() {
  await Context.run(
    { requestId: "req_42", tenantId: "acme", userId: "user_123" },
    async () => {
      const end = logger.startTimer("info");

      logger.info("request received", {
        method: "POST",
        route: "/v1/checkout",
        ip: "203.0.113.9",
      });

      const dbTimer = logger.startTimer("debug");
      await Promise.resolve();
      dbTimer("db query completed", { table: "carts", rows: 1 });

      const payments = logger.child({ integration: "stripe" });
      payments.warn("rate limit approaching", { remaining: 2 });

      try {
        throw new Error("gateway timeout");
      } catch (error) {
        payments.error("charge failed", {
          error,
          amount_cents: 4999,
          currency: "USD",
        });
      }

      end("request finished", { status: 502 });
    }
  );
}

async function main() {
  logger.info("service started", {
    pid: process.pid,
    env: process.env.NODE_ENV ?? "development",
    version: process.env.APP_VERSION ?? "dev",
  });

  await handleCheckout();

  logger.info("service shutting down", { signal: "SIGTERM" });
}

main().catch((error) => {
  logger.error("startup failed", { error });
  process.exitCode = 1;
});
