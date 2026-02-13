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

  it("filters request/response keys and truncates long strings", async () => {
    const longInput = "x".repeat(40);
    const maxStringLength = 20;
    const suffix = "...[truncated]";
    const expectedInput = `${longInput.slice(0, maxStringLength - suffix.length)}${suffix}`;

    await Context.run({}, async () => {
      await withOpenAIContext(
        "responses.create",
        { model: "gpt-4o", input: longInput, extra: "skip" },
        async () => ({
          id: "resp_1",
          model: "gpt-4o",
          status: "ok",
          extra: "ignore",
          _request_id: "req_1",
        }),
        {
          includeRequest: true,
          includeResponse: true,
          requestKeys: ["model", "input"],
          responseKeys: ["id", "status"],
          maxStringLength,
        }
      );

      const calls = Context.getValue("openai") as OpenAICallContext[];
      expect(calls[0].request).toEqual({
        model: "gpt-4o",
        input: expectedInput,
      });
      expect(calls[0].response).toEqual({ id: "resp_1", status: "ok" });
    });
  });

  it("uses prompt/completion tokens and overwrite mode", async () => {
    await Context.run({}, async () => {
      await withOpenAIContext(
        "responses.create",
        { model: "gpt-4o" },
        async () => ({
          id: "resp_1",
          model: "gpt-4o",
          usage: {
            prompt_tokens: 3,
            completion_tokens: 2,
            total_tokens: 5,
          },
        }),
        { mode: "overwrite" }
      );

      await withOpenAIContext(
        "responses.create",
        { model: "gpt-4o" },
        async () => ({
          id: "resp_2",
          model: "gpt-4o",
          usage: {
            prompt_tokens: 4,
            completion_tokens: 1,
            total_tokens: 5,
          },
        }),
        { mode: "overwrite" }
      );

      const entry = Context.getValue("openai") as OpenAICallContext;
      expect(Array.isArray(entry)).toBe(false);
      expect(entry.usage).toMatchObject({
        inputTokens: 4,
        outputTokens: 1,
        totalTokens: 5,
        promptTokens: 4,
        completionTokens: 1,
      });
    });
  });

  it("normalizes nested error shapes", async () => {
    const error = {
      message: "outer",
      type: "outer",
      error: {
        message: "inner",
        type: "rate_limit",
        code: "rate_limit",
        status: 429,
      },
    };

    await Context.run({}, async () => {
      await expect(
        withOpenAIContext(
          "responses.create",
          { model: "gpt-4o" },
          async () => {
            throw error;
          }
        )
      ).rejects.toEqual(error);

      const calls = Context.getValue("openai") as OpenAICallContext[];
      expect(calls[0].error).toMatchObject({
        message: "inner",
        type: "rate_limit",
        code: "rate_limit",
        status: 429,
      });
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
