import {
  Context,
  setOpenTelemetryBaggageFromContext,
  withOpenTelemetrySpan,
} from "@marceloraineri/async-context";

async function loadOpenTelemetry() {
  try {
    const mod = await import("@opentelemetry/api");
    return (mod as { default?: unknown }).default ?? mod;
  } catch {
    return null;
  }
}

async function main() {
  const api = await loadOpenTelemetry();
  if (!api) {
    console.log("@opentelemetry/api not installed");
    return;
  }

  await Context.run({ requestId: "req_1", tenantId: "t_123" }, async () => {
    await withOpenTelemetrySpan(
      "job.run",
      async () => {
        await Promise.resolve();
      },
      { api, attributes: { feature: "beta" } }
    );

    setOpenTelemetryBaggageFromContext({
      api,
      contextKeys: ["requestId", "tenantId"],
      baggagePrefix: "ctx.",
    });

    console.log("otel spans", Context.getValue("otel"));
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
