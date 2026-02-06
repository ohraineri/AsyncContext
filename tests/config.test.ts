import { describe, expect, it } from "vitest";
import {
  createLoggerFromEnv,
  loggerPreset,
  parseBooleanEnv,
  parseCsvEnv,
  parseLogFormatEnv,
  parseLogLevelEnv,
  parseLoggerPresetEnv,
  parseNumberEnv,
} from "../core/config";
import type { LogEntry } from "../core/logging/logger";

function createMemoryTransport(entries: LogEntry[]) {
  return (entry: LogEntry) => entries.push(entry);
}

describe("config helpers", () => {
  it("parses booleans", () => {
    expect(parseBooleanEnv("true")).toBe(true);
    expect(parseBooleanEnv("FALSE")).toBe(false);
    expect(parseBooleanEnv("1")).toBe(true);
    expect(parseBooleanEnv("0")).toBe(false);
    expect(parseBooleanEnv("maybe")).toBeUndefined();
    expect(parseBooleanEnv(undefined)).toBeUndefined();
  });

  it("parses numbers", () => {
    expect(parseNumberEnv("1.5")).toBe(1.5);
    expect(parseNumberEnv("abc")).toBeUndefined();
  });

  it("parses csv", () => {
    expect(parseCsvEnv("a,b,c")).toEqual(["a", "b", "c"]);
    expect(parseCsvEnv("  ")).toEqual([]);
    expect(parseCsvEnv(undefined)).toBeUndefined();
  });

  it("parses log levels and formats", () => {
    expect(parseLogLevelEnv("WARN")).toBe("warn");
    expect(parseLogLevelEnv("warning")).toBe("warn");
    expect(parseLogLevelEnv("err")).toBe("error");
    expect(parseLogLevelEnv("unknown")).toBeUndefined();
    expect(parseLogFormatEnv("json")).toBe("json");
    expect(parseLogFormatEnv("pretty")).toBe("pretty");
    expect(parseLogFormatEnv("xml")).toBeUndefined();
  });

  it("parses logger presets", () => {
    expect(parseLoggerPresetEnv("development")).toBe("development");
    expect(parseLoggerPresetEnv("PRODUCTION")).toBe("production");
    expect(parseLoggerPresetEnv("test")).toBe("test");
    expect(parseLoggerPresetEnv("other")).toBeUndefined();
  });

  it("returns preset options", () => {
    expect(loggerPreset("development").format).toBe("pretty");
    expect(loggerPreset("production").format).toBe("json");
    expect(loggerPreset("test").context).toBe(false);
  });

  it("creates logger from env", () => {
    const entries: LogEntry[] = [];
    const env = {
      LOG_PRESET: "production",
      LOG_LEVEL: "debug",
      LOG_FORMAT: "json",
      LOG_COLORS: "false",
      LOG_CONTEXT: "false",
      LOG_CONTEXT_KEY: "ctx",
      LOG_CONTEXT_KEYS: "requestId,tenantId",
      LOG_REDACT_KEYS: "ctx.token",
      LOG_REDACT_DEFAULTS: "false",
      LOG_REDACT_FIELDS: "creditCard",
      LOG_REDACT_PLACEHOLDER: "XXX",
      LOG_SAMPLE_RATE: "2",
      LOG_INCLUDE_PID: "false",
      LOG_INCLUDE_HOSTNAME: "true",
      LOG_TIMESTAMP: "true",
      LOG_NAME: "api",
    } as NodeJS.ProcessEnv;

    const logger = createLoggerFromEnv({
      env,
      defaults: {
        transport: createMemoryTransport(entries),
      },
    });

    logger.debug("hello");

    expect(entries.length).toBe(1);
    expect(entries[0].logger).toBe("api");
  });
});
