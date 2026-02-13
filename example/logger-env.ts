import { createLoggerFromEnv, loggerPreset } from "@marceloraineri/async-context";

const logger = createLoggerFromEnv({
  name: "api",
  defaults: loggerPreset("production"),
});

logger.info("service started", { pid: process.pid });
