import { describe, expect, it } from "vitest";
import { Context } from "../core/context";
import {
  type OpenAICallContext,
  withOpenAIContext,
} from "../core/integrations/openai";

describe("OpenAI integration", () => {
  it("records usage and request id on success", async () => {
    await Context.run({}, async () => {
      await withOpenAIContext(
        "responses.create",
        { model: "gpt-4o", input: "hello" },
        async () => ({
          id: "resp_1",
          model: "gpt-4o",
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            total_tokens: 15,
            input_tokens_details: { cached_tokens: 2 },
            output_tokens_details: { reasoning_tokens: 1 },
          },
          _request_id: "req_123",
        }),
        { includeRequest: true }
      );

      const calls = Context.getValue("openai") as OpenAICallContext[];
      expect(Array.isArray(calls)).toBe(true);
      expect(calls.length).toBe(1);
      const entry = calls[0];

      expect(entry.operation).toBe("responses.create");
      expect(entry.model).toBe("gpt-4o");
      expect(entry.requestId).toBe("req_123");
      expect(entry.usage).toEqual({
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        cachedTokens: 2,
        reasoningTokens: 1,
      });
      expect(entry.durationMs).toBeGreaterThanOrEqual(0);
      expect(entry.request).toEqual({ model: "gpt-4o" });
    });
  });

  it("records errors and rethrows", async () => {
    await Context.run({}, async () => {
      const error = new Error("boom");
      await expect(
        withOpenAIContext(
          "responses.create",
          { model: "gpt-4o", input: "hello" },
          async () => {
            throw error;
          }
        )
      ).rejects.toThrow("boom");

      const calls = Context.getValue("openai") as OpenAICallContext[];
      expect(calls.length).toBe(1);
      expect(calls[0].error?.message).toBe("boom");
    });
  });
});
