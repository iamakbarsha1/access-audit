import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock config before importing ai-client
vi.mock("../config.js", () => ({
  config: {
    anthropicApiKey: "test-anthropic-key",
    deepseekApiKey: undefined,
    aiProvider: "anthropic" as const,
    aiModel: "claude-haiku-4-5-20251001",
    aiMaxRetries: 3,
    aiTimeoutMs: 30000,
  },
}));

// Mock Anthropic SDK
const mockAnthropicCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockAnthropicCreate };
    },
  };
});

// Mock OpenAI SDK (for DeepSeek)
const mockOpenAICreate = vi.fn();
vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      chat = { completions: { create: mockOpenAICreate } };
    },
  };
});

import { generateFixSuggestions } from "../ai-client.js";

function makeInput(overrides?: Partial<Parameters<typeof generateFixSuggestions>[0]>) {
  return {
    ruleId: "image-alt",
    description: "Images must have alternate text",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.6/image-alt",
    wcagTags: ["wcag2a", "wcag111"],
    violations: [
      {
        id: "v1",
        htmlSnippet: '<img src="photo.jpg">',
        selector: "img.hero",
      },
    ],
    ...overrides,
  };
}

function anthropicResponse(text: string) {
  return {
    content: [{ type: "text", text }],
  };
}

describe("generateFixSuggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --- Valid JSON parsing ---

  it("parses a valid plain JSON response", async () => {
    const validJson = JSON.stringify({
      explanation: "Images need alt text for screen readers.",
      fixes: ['<img src="photo.jpg" alt="A scenic photo">'],
    });

    mockAnthropicCreate.mockResolvedValueOnce(anthropicResponse(validJson));

    const result = await generateFixSuggestions(makeInput());

    expect(result.explanation).toBe("Images need alt text for screen readers.");
    expect(result.fixes).toEqual(['<img src="photo.jpg" alt="A scenic photo">']);
  });

  it("parses a JSON response wrapped in markdown code block", async () => {
    const wrappedJson = '```json\n{"explanation": "Alt text is needed.", "fixes": ["<img alt=\\"fix\\">"]}\n```';

    mockAnthropicCreate.mockResolvedValueOnce(anthropicResponse(wrappedJson));

    const result = await generateFixSuggestions(makeInput());

    expect(result.explanation).toBe("Alt text is needed.");
    expect(result.fixes).toEqual(['<img alt="fix">']);
  });

  it("parses a JSON response wrapped in plain code block (no language tag)", async () => {
    const wrappedJson = '```\n{"explanation": "Fix it.", "fixes": ["<img alt=\\"done\\">"]}\n```';

    mockAnthropicCreate.mockResolvedValueOnce(anthropicResponse(wrappedJson));

    const result = await generateFixSuggestions(makeInput());

    expect(result.explanation).toBe("Fix it.");
    expect(result.fixes).toEqual(['<img alt="done">']);
  });

  it("handles multiple fixes in the correct order", async () => {
    const json = JSON.stringify({
      explanation: "All images need alt text.",
      fixes: ["<img alt='first'>", "<img alt='second'>", "<img alt='third'>"],
    });

    mockAnthropicCreate.mockResolvedValueOnce(anthropicResponse(json));

    const input = makeInput({
      violations: [
        { id: "v1", htmlSnippet: "<img>", selector: "img:nth-child(1)" },
        { id: "v2", htmlSnippet: "<img>", selector: "img:nth-child(2)" },
        { id: "v3", htmlSnippet: "<img>", selector: "img:nth-child(3)" },
      ],
    });

    const result = await generateFixSuggestions(input);

    expect(result.fixes).toHaveLength(3);
    expect(result.fixes[0]).toBe("<img alt='first'>");
    expect(result.fixes[2]).toBe("<img alt='third'>");
  });

  // --- Invalid response handling ---

  it("throws on invalid JSON after exhausting retries", async () => {
    mockAnthropicCreate.mockResolvedValue(anthropicResponse("this is not json"));

    await expect(generateFixSuggestions(makeInput())).rejects.toThrow();

    expect(mockAnthropicCreate).toHaveBeenCalledTimes(3);
  });

  it("throws when response is missing explanation field", async () => {
    const badJson = JSON.stringify({ fixes: ["<img alt='fix'>"] });
    mockAnthropicCreate.mockResolvedValue(anthropicResponse(badJson));

    await expect(generateFixSuggestions(makeInput())).rejects.toThrow(
      "Invalid AI response structure"
    );
  });

  it("throws when response is missing fixes array", async () => {
    const badJson = JSON.stringify({ explanation: "Some text" });
    mockAnthropicCreate.mockResolvedValue(anthropicResponse(badJson));

    await expect(generateFixSuggestions(makeInput())).rejects.toThrow(
      "Invalid AI response structure"
    );
  });

  it("throws when fixes contains non-string elements", async () => {
    const badJson = JSON.stringify({
      explanation: "Some text",
      fixes: [123, true],
    });
    mockAnthropicCreate.mockResolvedValue(anthropicResponse(badJson));

    await expect(generateFixSuggestions(makeInput())).rejects.toThrow(
      "Invalid AI response structure"
    );
  });

  it("throws when AI returns no text content block", async () => {
    mockAnthropicCreate.mockResolvedValue({ content: [] });

    await expect(generateFixSuggestions(makeInput())).rejects.toThrow(
      "No text content in AI response"
    );
  });

  // --- Retry logic ---

  it("retries on failure and succeeds on second attempt", async () => {
    const validJson = JSON.stringify({
      explanation: "Fixed.",
      fixes: ["<img alt='ok'>"],
    });

    mockAnthropicCreate
      .mockRejectedValueOnce(new Error("API rate limit"))
      .mockResolvedValueOnce(anthropicResponse(validJson));

    const result = await generateFixSuggestions(makeInput());

    expect(result.explanation).toBe("Fixed.");
    expect(mockAnthropicCreate).toHaveBeenCalledTimes(2);
  });

  it("retries on parse failure and succeeds when valid response arrives", async () => {
    const invalidResponse = anthropicResponse("not json at all");
    const validResponse = anthropicResponse(
      JSON.stringify({ explanation: "OK.", fixes: ["<img alt='yes'>"] })
    );

    mockAnthropicCreate
      .mockResolvedValueOnce(invalidResponse)
      .mockResolvedValueOnce(validResponse);

    const result = await generateFixSuggestions(makeInput());

    expect(result.explanation).toBe("OK.");
    expect(mockAnthropicCreate).toHaveBeenCalledTimes(2);
  });

  it("exhausts all retries and throws last error", async () => {
    mockAnthropicCreate.mockRejectedValue(new Error("Service unavailable"));

    await expect(generateFixSuggestions(makeInput())).rejects.toThrow(
      "Service unavailable"
    );

    expect(mockAnthropicCreate).toHaveBeenCalledTimes(3);
  });

  // --- Prompt construction (verified via mock call inspection) ---

  it("constructs prompt with correct rule info and violation data", async () => {
    const validJson = JSON.stringify({
      explanation: "Explained.",
      fixes: ["<img alt='fixed'>"],
    });
    mockAnthropicCreate.mockResolvedValueOnce(anthropicResponse(validJson));

    await generateFixSuggestions(makeInput());

    const call = mockAnthropicCreate.mock.calls[0][0];
    const prompt = call.messages[0].content;

    expect(prompt).toContain('rule "image-alt"');
    expect(prompt).toContain("Images must have alternate text");
    expect(prompt).toContain("wcag2a, wcag111");
    expect(prompt).toContain("https://dequeuniversity.com/rules/axe/4.6/image-alt");
    expect(prompt).toContain("img.hero");
    expect(prompt).toContain('<img src="photo.jpg">');
  });

  it("sends system prompt as accessibility expert instruction", async () => {
    const validJson = JSON.stringify({
      explanation: "Done.",
      fixes: ["<img alt='x'>"],
    });
    mockAnthropicCreate.mockResolvedValueOnce(anthropicResponse(validJson));

    await generateFixSuggestions(makeInput());

    const call = mockAnthropicCreate.mock.calls[0][0];
    expect(call.system).toContain("accessibility expert");
    expect(call.system).toContain("WCAG");
  });

  it("truncates long HTML snippets in the prompt", async () => {
    const longHtml = "<div>" + "a".repeat(600) + "</div>";
    const validJson = JSON.stringify({
      explanation: "Truncated.",
      fixes: ["<div>fixed</div>"],
    });
    mockAnthropicCreate.mockResolvedValueOnce(anthropicResponse(validJson));

    await generateFixSuggestions(
      makeInput({
        violations: [{ id: "v1", htmlSnippet: longHtml, selector: ".long" }],
      })
    );

    const call = mockAnthropicCreate.mock.calls[0][0];
    const prompt = call.messages[0].content;

    // The snippet should be truncated to 500 chars + "..."
    expect(prompt).toContain("...");
    expect(prompt).not.toContain(longHtml);
  });

  it("numbers multiple violations in the prompt", async () => {
    const validJson = JSON.stringify({
      explanation: "Multiple issues.",
      fixes: ["<img alt='a'>", "<img alt='b'>"],
    });
    mockAnthropicCreate.mockResolvedValueOnce(anthropicResponse(validJson));

    await generateFixSuggestions(
      makeInput({
        violations: [
          { id: "v1", htmlSnippet: "<img>", selector: ".first" },
          { id: "v2", htmlSnippet: "<img>", selector: ".second" },
        ],
      })
    );

    const call = mockAnthropicCreate.mock.calls[0][0];
    const prompt = call.messages[0].content;

    expect(prompt).toContain("1. Selector: .first");
    expect(prompt).toContain("2. Selector: .second");
    expect(prompt).toContain("2 HTML elements");
  });
});

describe("generateFixSuggestions with DeepSeek provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses DeepSeek client when provider is configured as deepseek", async () => {
    // Dynamically change config to use deepseek
    const { config } = await import("../config.js");
    (config as Record<string, unknown>).aiProvider = "deepseek";
    (config as Record<string, unknown>).deepseekApiKey = "test-deepseek-key";

    const validJson = JSON.stringify({
      explanation: "DeepSeek fixed it.",
      fixes: ["<img alt='ds'>"],
    });

    mockOpenAICreate.mockResolvedValueOnce({
      choices: [{ message: { content: validJson } }],
    });

    // Re-import to get fresh module with updated config
    const { generateFixSuggestions: genFix } = await import("../ai-client.js");

    const result = await genFix(makeInput());

    expect(result.explanation).toBe("DeepSeek fixed it.");
    expect(mockOpenAICreate).toHaveBeenCalled();

    // Reset config
    (config as Record<string, unknown>).aiProvider = "anthropic";
    (config as Record<string, unknown>).deepseekApiKey = undefined;
  });
});
