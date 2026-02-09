import { Context } from "../context";

type UnknownRecord = Record<string, unknown>;

export type OpenAIUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  cachedTokens?: number;
  reasoningTokens?: number;
};

export type OpenAICallError = {
  name?: string;
  message: string;
  type?: string;
  code?: string;
  status?: number;
};

export type OpenAICallContext = {
  provider: "openai";
  operation: string;
  model?: string;
  requestId?: string;
  durationMs: number;
  usage?: OpenAIUsage;
  request?: UnknownRecord;
  response?: UnknownRecord;
  error?: OpenAICallError;
};

export type OpenAIContextOptions = {
  key?: string;
  mode?: "append" | "overwrite";
  includeRequest?: boolean;
  includeResponse?: boolean;
  requestKeys?: string[];
  responseKeys?: string[];
  maxStringLength?: number;
  now?: () => number;
};

const DEFAULT_CONTEXT_KEY = "openai";
const DEFAULT_MODE: OpenAIContextOptions["mode"] = "append";
const DEFAULT_MAX_STRING_LENGTH = 1000;
const TRUNCATED_SUFFIX = "...[truncated]";
const DEFAULT_REQUEST_KEYS = [
  "model",
  "stream",
  "max_output_tokens",
  "max_tokens",
  "temperature",
  "top_p",
  "response_format",
  "reasoning",
  "tool_choice",
  "parallel_tool_calls",
  "seed",
  "n",
  "service_tier",
  "truncation",
];
const DEFAULT_RESPONSE_KEYS = [
  "id",
  "model",
  "object",
  "created",
  "created_at",
  "status",
  "service_tier",
];

export async function withOpenAIContext<
  TRequest extends UnknownRecord,
  TResponse
>(
  operation: string,
  request: TRequest,
  call: (request: TRequest) => Promise<TResponse>,
  options: OpenAIContextOptions = {}
): Promise<TResponse> {
  const now = options.now ?? Date.now;
  const startedAt = now();

  try {
    const response = await call(request);
    recordOpenAICall(
      buildCallSummary({ operation, request, response, durationMs: now() - startedAt, options }),
      options
    );
    return response;
  } catch (error) {
    recordOpenAICall(
      buildCallSummary({ operation, request, error, durationMs: now() - startedAt, options }),
      options
    );
    throw error;
  }
}

export function recordOpenAICall(
  summary: OpenAICallContext,
  options: OpenAIContextOptions = {}
): void {
  const store = Context.getStore<UnknownRecord>();
  if (!store) return;

  const key = options.key ?? DEFAULT_CONTEXT_KEY;
  const mode = options.mode ?? DEFAULT_MODE;

  if (mode === "overwrite") {
    store[key] = summary;
    return;
  }

  const existing = store[key];
  if (Array.isArray(existing)) {
    existing.push(summary);
    return;
  }

  if (existing === undefined) {
    store[key] = [summary];
    return;
  }

  store[key] = [existing, summary];
}

function buildCallSummary({
  operation,
  request,
  response,
  error,
  durationMs,
  options,
}: {
  operation: string;
  request: UnknownRecord;
  response?: unknown;
  error?: unknown;
  durationMs: number;
  options: OpenAIContextOptions;
}): OpenAICallContext {
  const summary: OpenAICallContext = {
    provider: "openai",
    operation,
    durationMs: Math.max(0, durationMs),
  };

  const model =
    (isRecord(response) && typeof response.model === "string" && response.model) ||
    (typeof request.model === "string" && request.model) ||
    undefined;
  if (model) summary.model = model;

  const requestId = extractRequestId(response);
  if (requestId) summary.requestId = requestId;

  const usage = extractUsage(response);
  if (usage) summary.usage = usage;

  if (error) summary.error = normalizeError(error);

  if (options.includeRequest) {
    const keys = options.requestKeys ?? DEFAULT_REQUEST_KEYS;
    const picked = pickKeys(request, keys, options.maxStringLength);
    if (picked) summary.request = picked;
  }

  if (options.includeResponse) {
    const keys = options.responseKeys ?? DEFAULT_RESPONSE_KEYS;
    const picked = pickKeys(response, keys, options.maxStringLength);
    if (picked) summary.response = picked;
  }

  return summary;
}

function extractRequestId(response: unknown): string | undefined {
  if (!isRecord(response)) return undefined;
  const requestId = response._request_id ?? response.request_id;
  return typeof requestId === "string" ? requestId : undefined;
}

function extractUsage(response: unknown): OpenAIUsage | undefined {
  if (!isRecord(response)) return undefined;
  const usage = response.usage;
  if (!isRecord(usage)) return undefined;

  const result: OpenAIUsage = {};

  if (isNumber(usage.input_tokens)) result.inputTokens = usage.input_tokens;
  if (isNumber(usage.output_tokens)) result.outputTokens = usage.output_tokens;
  if (isNumber(usage.total_tokens)) result.totalTokens = usage.total_tokens;
  if (isNumber(usage.prompt_tokens)) result.promptTokens = usage.prompt_tokens;
  if (isNumber(usage.completion_tokens))
    result.completionTokens = usage.completion_tokens;

  if (result.inputTokens === undefined && result.promptTokens !== undefined) {
    result.inputTokens = result.promptTokens;
  }
  if (result.outputTokens === undefined && result.completionTokens !== undefined) {
    result.outputTokens = result.completionTokens;
  }

  const promptDetails = usage.prompt_tokens_details;
  if (isRecord(promptDetails) && isNumber(promptDetails.cached_tokens)) {
    result.cachedTokens = promptDetails.cached_tokens;
  }

  const inputDetails = usage.input_tokens_details;
  if (isRecord(inputDetails) && isNumber(inputDetails.cached_tokens)) {
    result.cachedTokens = inputDetails.cached_tokens;
  }

  const completionDetails = usage.completion_tokens_details;
  if (isRecord(completionDetails) && isNumber(completionDetails.reasoning_tokens)) {
    result.reasoningTokens = completionDetails.reasoning_tokens;
  }

  const outputDetails = usage.output_tokens_details;
  if (isRecord(outputDetails) && isNumber(outputDetails.reasoning_tokens)) {
    result.reasoningTokens = outputDetails.reasoning_tokens;
  }

  return Object.keys(result).length ? result : undefined;
}

function normalizeError(error: unknown): OpenAICallError {
  let message = "Unknown error";
  let name: string | undefined;
  let type: string | undefined;
  let code: string | undefined;
  let status: number | undefined;

  if (typeof error === "string") {
    message = error;
  } else if (error instanceof Error) {
    message = error.message;
    name = error.name;
  } else if (isRecord(error)) {
    if (typeof error.message === "string") message = error.message;
    if (typeof error.name === "string") name = error.name;
    if (typeof error.type === "string") type = error.type;
    if (typeof error.code === "string") code = error.code;
    if (typeof error.status === "number") status = error.status;

    const nested = error.error;
    if (isRecord(nested)) {
      if (typeof nested.message === "string") message = nested.message;
      if (typeof nested.type === "string") type = nested.type;
      if (typeof nested.code === "string") code = nested.code;
      if (typeof nested.status === "number") status = nested.status;
    }
  } else {
    message = String(error);
  }

  return {
    name,
    message,
    type,
    code,
    status,
  };
}

function pickKeys(
  value: unknown,
  keys: string[],
  maxStringLength?: number
): UnknownRecord | undefined {
  if (!isRecord(value)) return undefined;
  if (!keys.length) return undefined;
  const maxLength = maxStringLength ?? DEFAULT_MAX_STRING_LENGTH;
  const output: UnknownRecord = {};

  for (const key of keys) {
    if (!(key in value)) continue;
    output[key] = truncateValue(value[key], maxLength);
  }

  return Object.keys(output).length ? output : undefined;
}

function truncateValue(value: unknown, maxLength: number): unknown {
  if (typeof value !== "string") return value;
  return truncateString(value, maxLength);
}

function truncateString(value: string, maxLength: number): string {
  if (maxLength <= 0) return "";
  if (value.length <= maxLength) return value;
  const suffix = TRUNCATED_SUFFIX;
  const sliceLength = Math.max(0, maxLength - suffix.length);
  return `${value.slice(0, sliceLength)}${suffix}`;
}

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
