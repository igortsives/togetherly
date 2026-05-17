import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

/**
 * Issue #52 / Round 17 — Anthropic client wrapper for LLM-assisted
 * extraction and natural-language search. Designed so every call
 * either:
 *
 *  1. Returns a Zod-validated structured object (success path).
 *  2. Returns `null` (no-op path — `ANTHROPIC_API_KEY` unset).
 *  3. Throws a typed `LlmExtractionError` (handler decides whether
 *     to retry, fall back to heuristics, or surface to the user).
 *
 * Per PRD AI-001, all callers must handle the `null` return so the
 * product no-ops gracefully when the key isn't configured (local
 * dev / CI). Per AI-005, output is validated against a Zod schema
 * before being applied — schema failure surfaces as
 * `LlmExtractionError` so the caller can fall back.
 *
 * Per AI-006, logging records only `{ kind, candidateCount, latencyMs,
 * success }` — never the prompt or response body.
 */

const MODEL = "claude-sonnet-4-6";

const LLM_REQUEST_TIMEOUT_MS = 60_000;
const LLM_MAX_TOKENS = 8192;

export class LlmExtractionError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "LlmExtractionError";
  }
}

export function isLlmConfigured(): boolean {
  const key = process.env.ANTHROPIC_API_KEY;
  return typeof key === "string" && key.trim().length > 0;
}

let cachedClient: Anthropic | null = null;

function client(): Anthropic | null {
  if (!isLlmConfigured()) return null;
  if (!cachedClient) {
    cachedClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      timeout: LLM_REQUEST_TIMEOUT_MS
    });
  }
  return cachedClient;
}

/** Reset the cached client. Test-only — use `vi.mocked` etc. instead
 * in unit tests; this exists for integration setups that swap env. */
export function resetLlmClient(): void {
  cachedClient = null;
}

export type LlmCallOptions<TOutput> = {
  /** Short label for logs (`extract-html`, `parse-search-query`). */
  kind: string;
  /** System prompt describing the role + structured-output contract. */
  systemPrompt: string;
  /** User content — text only for now. Caller decides chunking. */
  userContent: string;
  /** Zod schema that validates the parsed JSON response. */
  responseSchema: z.ZodType<TOutput>;
  /** Optional token cap override (default: LLM_MAX_TOKENS). */
  maxTokens?: number;
};

/**
 * Issue a single structured-output call to Claude and validate the
 * response. Returns the parsed value on success, `null` if the key
 * isn't configured, throws `LlmExtractionError` on any failure that
 * the caller must decide how to handle (network, JSON parse, schema
 * validation, content-policy refusal, etc).
 */
export async function callLlmStructured<TOutput>(
  options: LlmCallOptions<TOutput>
): Promise<TOutput | null> {
  const c = client();
  if (!c) return null;

  const startedAt = Date.now();
  let success = false;
  let outputForLog = "(none)";

  try {
    const response = await c.messages.create({
      model: MODEL,
      max_tokens: options.maxTokens ?? LLM_MAX_TOKENS,
      system: options.systemPrompt,
      messages: [{ role: "user", content: options.userContent }]
    });

    // Extract the first text block. The structured-output convention
    // is "respond with JSON only" enforced via the system prompt.
    const textBlock = response.content.find(
      (block): block is { type: "text"; text: string } & typeof block =>
        block.type === "text"
    );
    if (!textBlock || textBlock.text.trim().length === 0) {
      throw new LlmExtractionError("LLM returned no text content");
    }

    // The model occasionally wraps JSON in a Markdown code fence
    // (```json ... ```). Strip if present.
    const jsonText = stripCodeFence(textBlock.text);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (parseError) {
      throw new LlmExtractionError(
        "LLM response was not valid JSON",
        parseError
      );
    }

    const validation = options.responseSchema.safeParse(parsed);
    if (!validation.success) {
      throw new LlmExtractionError(
        `LLM response failed schema validation: ${validation.error.message}`,
        validation.error
      );
    }

    success = true;
    outputForLog = `validated`;
    return validation.data;
  } catch (error) {
    if (error instanceof LlmExtractionError) throw error;
    throw new LlmExtractionError(
      `LLM call failed: ${error instanceof Error ? error.message : String(error)}`,
      error
    );
  } finally {
    const latencyMs = Date.now() - startedAt;
    // AI-006 logging boundary: no prompt, no response body, no PII.
    console.info("LLM call complete", {
      kind: options.kind,
      success,
      latencyMs,
      output: outputForLog
    });
  }
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  // ```json\n...\n``` or ```\n...\n```
  const stripped = trimmed
    .replace(/^```(?:json)?\s*\n?/, "")
    .replace(/\n?```\s*$/, "");
  return stripped.trim();
}
