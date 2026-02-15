import { describe, expect, it } from "vitest";
import * as rootExports from "../index";
import * as coreExports from "../core/index";

describe("exports", () => {
  it("exposes public API from root entry", () => {
    expect(rootExports.Context).toBeDefined();
    expect(rootExports.createLogger).toBeDefined();
    expect(rootExports.createAsyncContextExpressMiddleware).toBeDefined();
    expect(rootExports.createAsyncContextFastifyHook).toBeDefined();
    expect(rootExports.createAsyncContextKoaMiddleware).toBeDefined();
    expect(rootExports.createAsyncContextNextHandler).toBeDefined();
    expect(rootExports.createLoggerFromEnv).toBeDefined();
    expect(rootExports.resolveLoggerEnv).toBeDefined();
    expect(rootExports.withOpenTelemetrySpan).toBeDefined();
    expect(rootExports.createAsyncContextExpressOpenTelemetryMiddleware).toBeDefined();
  });

  it("exposes public API from core entry", () => {
    expect(coreExports.Context).toBeDefined();
    expect(coreExports.createLogger).toBeDefined();
    expect(coreExports.createAsyncContextExpressMiddleware).toBeDefined();
    expect(coreExports.resolveLoggerEnv).toBeDefined();
    expect(coreExports.withOpenTelemetrySpan).toBeDefined();
    expect(coreExports.createAsyncContextExpressOpenTelemetryMiddleware).toBeDefined();
  });
});
