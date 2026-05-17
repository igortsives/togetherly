import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const createMock = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: createMock };
  }
}));

import {
  callLlmStructured,
  isLlmConfigured,
  LlmExtractionError,
  resetLlmClient
} from "./anthropic";

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

const schema = z.object({ events: z.array(z.object({ title: z.string() })) });

beforeEach(() => {
  vi.resetAllMocks();
  resetLlmClient();
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) {
    delete process.env.ANTHROPIC_API_KEY;
  } else {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  }
  resetLlmClient();
});

describe("isLlmConfigured", () => {
  it("returns false when ANTHROPIC_API_KEY is unset", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(isLlmConfigured()).toBe(false);
  });

  it("returns false when ANTHROPIC_API_KEY is empty / whitespace", () => {
    process.env.ANTHROPIC_API_KEY = "   ";
    expect(isLlmConfigured()).toBe(false);
  });

  it("returns true when ANTHROPIC_API_KEY is set to a real-shaped string", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect(isLlmConfigured()).toBe(true);
  });
});

describe("callLlmStructured", () => {
  it("returns null when API key is not configured (no-op path)", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const result = await callLlmStructured({
      kind: "test",
      systemPrompt: "x",
      userContent: "y",
      responseSchema: schema
    });
    expect(result).toBeNull();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns the parsed object when the LLM produces valid JSON", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    createMock.mockResolvedValue({
      content: [
        {
          type: "text",
          text: '{"events":[{"title":"Spring Break"}]}'
        }
      ]
    });

    const result = await callLlmStructured({
      kind: "test",
      systemPrompt: "x",
      userContent: "y",
      responseSchema: schema
    });

    expect(result).toEqual({ events: [{ title: "Spring Break" }] });
  });

  it("strips Markdown code fences before parsing", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    createMock.mockResolvedValue({
      content: [
        {
          type: "text",
          text:
            '```json\n{"events":[{"title":"Spring Break"}]}\n```'
        }
      ]
    });

    const result = await callLlmStructured({
      kind: "test",
      systemPrompt: "x",
      userContent: "y",
      responseSchema: schema
    });

    expect(result).toEqual({ events: [{ title: "Spring Break" }] });
  });

  it("throws LlmExtractionError when the response is not valid JSON", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    createMock.mockResolvedValue({
      content: [{ type: "text", text: "not json at all" }]
    });

    await expect(
      callLlmStructured({
        kind: "test",
        systemPrompt: "x",
        userContent: "y",
        responseSchema: schema
      })
    ).rejects.toBeInstanceOf(LlmExtractionError);
  });

  it("throws LlmExtractionError when the response fails schema validation", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    createMock.mockResolvedValue({
      content: [
        {
          type: "text",
          text: '{"events":[{"wrongShape":42}]}'
        }
      ]
    });

    await expect(
      callLlmStructured({
        kind: "test",
        systemPrompt: "x",
        userContent: "y",
        responseSchema: schema
      })
    ).rejects.toBeInstanceOf(LlmExtractionError);
  });

  it("throws LlmExtractionError when the SDK throws (network/timeout)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    createMock.mockRejectedValue(new Error("connect ETIMEDOUT"));

    await expect(
      callLlmStructured({
        kind: "test",
        systemPrompt: "x",
        userContent: "y",
        responseSchema: schema
      })
    ).rejects.toBeInstanceOf(LlmExtractionError);
  });

  it("throws LlmExtractionError when the response has no text block", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    createMock.mockResolvedValue({ content: [] });

    await expect(
      callLlmStructured({
        kind: "test",
        systemPrompt: "x",
        userContent: "y",
        responseSchema: schema
      })
    ).rejects.toBeInstanceOf(LlmExtractionError);
  });
});
