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
  resolveLoggerEnv,
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

  it("collects warnings for invalid env values", () => {
    const env = {
      LOG_PRESET: "staging",
      LOG_LEVEL: "verbose",
      LOG_FORMAT: "xml",
      LOG_COLORS: "maybe",
      LOG_CONTEXT: "yup",
      LOG_SAMPLE_RATE: "2",
    } as NodeJS.ProcessEnv;

    const { options, warnings } = resolveLoggerEnv({ env });

    const keys = warnings.map((warning) => warning.key).sort();
    expect(keys).toEqual(
      [
        "LOG_COLORS",
        "LOG_CONTEXT",
        "LOG_FORMAT",
        "LOG_LEVEL",
        "LOG_PRESET",
        "LOG_SAMPLE_RATE",
      ].sort()
    );
    expect(options.sampleRate).toBe(1);
  });

  it("parses boolean yes/no variants", () => {
    expect(parseBooleanEnv("yes")).toBe(true);
    expect(parseBooleanEnv("no")).toBe(false);
  });

  it("parses boolean on/off variants", () => {
    expect(parseBooleanEnv("on")).toBe(true);
    expect(parseBooleanEnv("off")).toBe(false);
  });

  it("parses boolean y/n variants", () => {
    expect(parseBooleanEnv("y")).toBe(true);
    expect(parseBooleanEnv("n")).toBe(false);
  });

  it("trims boolean whitespace", () => {
    expect(parseBooleanEnv("  YES  ")).toBe(true);
    expect(parseBooleanEnv("  n  ")).toBe(false);
  });

  it("treats empty boolean as undefined", () => {
    expect(parseBooleanEnv("")).toBeUndefined();
  });

  it("parses numeric zero", () => {
    expect(parseNumberEnv("0")).toBe(0);
  });

  it("parses negative numbers", () => {
    expect(parseNumberEnv("-5")).toBe(-5);
  });

  it("returns undefined for NaN numbers", () => {
    expect(parseNumberEnv("NaN")).toBeUndefined();
  });

  it("returns undefined for Infinity numbers", () => {
    expect(parseNumberEnv("Infinity")).toBeUndefined();
  });

  it("parses numbers with whitespace", () => {
    expect(parseNumberEnv(" 2 ")).toBe(2);
  });

  it("parses single csv item", () => {
    expect(parseCsvEnv("solo")).toEqual(["solo"]);
  });

  it("drops empty csv entries", () => {
    expect(parseCsvEnv("a,,b")).toEqual(["a", "b"]);
  });

  it("handles trailing csv commas", () => {
    expect(parseCsvEnv("a,b,")).toEqual(["a", "b"]);
  });

  it("handles spaced csv entries", () => {
    expect(parseCsvEnv(" a , b , c ")).toEqual(["a", "b", "c"]);
  });

  it("filters repeated csv separators", () => {
    expect(parseCsvEnv("a, , ,b")).toEqual(["a", "b"]);
  });

  it("normalizes ERROR log level", () => {
    expect(parseLogLevelEnv("ERROR")).toBe("error");
  });

  it("normalizes Fatal log level", () => {
    expect(parseLogLevelEnv("Fatal")).toBe("fatal");
  });

  it("parses log level with whitespace", () => {
    expect(parseLogLevelEnv(" info ")).toBe("info");
  });

  it("parses warn log level", () => {
    expect(parseLogLevelEnv("Warn")).toBe("warn");
  });

  it("returns undefined for empty log level", () => {
    expect(parseLogLevelEnv("")).toBeUndefined();
  });

  it("parses json log format with whitespace", () => {
    expect(parseLogFormatEnv(" JSON ")).toBe("json");
  });

  it("parses pretty log format with whitespace", () => {
    expect(parseLogFormatEnv(" pretty ")).toBe("pretty");
  });

  it("returns undefined for empty log format", () => {
    expect(parseLogFormatEnv("")).toBeUndefined();
  });

  it("parses production preset with whitespace", () => {
    expect(parseLoggerPresetEnv("  production ")).toBe("production");
  });

  it("parses test preset in uppercase", () => {
    expect(parseLoggerPresetEnv("TEST")).toBe("test");
  });

  it("exposes production preset hostname", () => {
    expect(loggerPreset("production").includeHostname).toBe(true);
  });

  it("exposes development preset colors", () => {
    expect(loggerPreset("development").colors).toBe(true);
  });

  it("exposes test preset defaults", () => {
    const preset = loggerPreset("test");
    expect(preset.includePid).toBe(false);
    expect(preset.timestamp).toBe(false);
  });

  it("prefers LOG_NAME over LOGGER_NAME", () => {
    const env = {
      LOG_NAME: "api",
      LOGGER_NAME: "ignored",
    } as NodeJS.ProcessEnv;

    const { options } = resolveLoggerEnv({ env });
    expect(options.name).toBe("api");
  });

  it("uses LOGGER_NAME when LOG_NAME empty", () => {
    const env = {
      LOG_NAME: "",
      LOGGER_NAME: "service",
    } as NodeJS.ProcessEnv;

    const { options } = resolveLoggerEnv({ env });
    expect(options.name).toBe("service");
  });

  it("merges defaults when env missing", () => {
    const { options } = resolveLoggerEnv({
      env: {},
      defaults: { level: "debug", format: "pretty" },
    });
    expect(options.level).toBe("debug");
    expect(options.format).toBe("pretty");
  });

  it("overrides defaults with env values", () => {
    const env = {
      LOG_LEVEL: "error",
      LOG_FORMAT: "json",
    } as NodeJS.ProcessEnv;

    const { options } = resolveLoggerEnv({
      env,
      defaults: { level: "info", format: "pretty" },
    });

    expect(options.level).toBe("error");
    expect(options.format).toBe("json");
  });

  it("accepts LOGLEVEL alias", () => {
    const env = { LOGLEVEL: "warn" } as NodeJS.ProcessEnv;
    const { options } = resolveLoggerEnv({ env });
    expect(options.level).toBe("warn");
  });

  it("accepts LOG_COLOURS alias", () => {
    const env = { LOG_COLOURS: "true" } as NodeJS.ProcessEnv;
    const { options } = resolveLoggerEnv({ env });
    expect(options.colors).toBe(true);
  });

  it("parses context keys list", () => {
    const env = {
      LOG_CONTEXT_KEYS: "requestId, tenantId",
    } as NodeJS.ProcessEnv;
    const { options } = resolveLoggerEnv({ env });
    expect(options.contextKeys).toEqual(["requestId", "tenantId"]);
  });

  it("parses redact field names list", () => {
    const env = { LOG_REDACT_FIELDS: "token, ssn" } as NodeJS.ProcessEnv;
    const { options } = resolveLoggerEnv({ env });
    expect(options.redactFieldNames).toEqual(["token", "ssn"]);
  });

  it("clamps sample rate above 1", () => {
    const env = { LOG_SAMPLE_RATE: "5" } as NodeJS.ProcessEnv;
    const { options, warnings } = resolveLoggerEnv({ env });
    expect(options.sampleRate).toBe(1);
    expect(warnings.some((warning) => warning.key === "LOG_SAMPLE_RATE")).toBe(
      true
    );
  });

  it("clamps sample rate below 0", () => {
    const env = { LOG_SAMPLE_RATE: "-0.5" } as NodeJS.ProcessEnv;
    const { options, warnings } = resolveLoggerEnv({ env });
    expect(options.sampleRate).toBe(0);
    expect(warnings.some((warning) => warning.key === "LOG_SAMPLE_RATE")).toBe(
      true
    );
  });

  it("warns on invalid include pid value", () => {
    const env = { LOG_INCLUDE_PID: "maybe" } as NodeJS.ProcessEnv;
    const { warnings } = resolveLoggerEnv({ env });
    const keys = warnings.map((warning) => warning.key);
    expect(keys).toContain("LOG_INCLUDE_PID");
  });

  it("invokes onWarning callback", () => {
    const warnings: string[] = [];
    const env = { LOG_LEVEL: "loud" } as NodeJS.ProcessEnv;

    createLoggerFromEnv({
      env,
      onWarning: (warning) => warnings.push(warning.key),
    });

    expect(warnings).toEqual(["LOG_LEVEL"]);
  });
});
