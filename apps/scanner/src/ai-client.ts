import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import type { AiFixResult } from "./types.js";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!config.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set — cannot process AI suggestions");
  }
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}

interface ViolationInput {
  id: string;
  htmlSnippet: string;
  selector: string;
}

interface GenerateInput {
  ruleId: string;
  description: string;
  helpUrl: string;
  wcagTags: string[];
  violations: ViolationInput[];
}

function buildPrompt(input: GenerateInput): string {
  const truncate = (s: string, max: number) =>
    s.length > max ? s.slice(0, max) + "..." : s;

  const elements = input.violations
    .map(
      (v, i) =>
        `${i + 1}. Selector: ${v.selector}\n   HTML: ${truncate(v.htmlSnippet, 500)}`
    )
    .join("\n\n");

  return `A WCAG audit found violations of rule "${input.ruleId}".

Rule: ${input.description}
WCAG tags: ${input.wcagTags.join(", ")}
Reference: ${input.helpUrl}

The following ${input.violations.length} HTML elements violate this rule:

${elements}

Provide:
1. "explanation" — A plain-English explanation of why this is an accessibility problem (2-3 sentences, for a non-technical audience)
2. "fixes" — An array with one corrected HTML snippet per element above, in the same order`;
}

function parseResponse(text: string): AiFixResult {
  // Extract JSON from response (handle markdown code blocks)
  let jsonStr = text.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = (jsonMatch[1] ?? jsonStr).trim();
  }

  const parsed = JSON.parse(jsonStr);

  if (
    typeof parsed.explanation !== "string" ||
    !Array.isArray(parsed.fixes) ||
    !parsed.fixes.every((f: unknown) => typeof f === "string")
  ) {
    throw new Error("Invalid AI response structure: missing explanation or fixes array");
  }

  return {
    explanation: parsed.explanation,
    fixes: parsed.fixes,
  };
}

export async function generateFixSuggestions(
  input: GenerateInput
): Promise<AiFixResult> {
  const anthropic = getClient();

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= config.aiMaxRetries; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model: config.aiModel,
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: buildPrompt(input),
          },
        ],
        system:
          "You are an accessibility expert helping developers fix WCAG violations. Respond ONLY with valid JSON matching this schema: { \"explanation\": string, \"fixes\": string[] }",
      });

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text content in AI response");
      }

      return parseResponse(textBlock.text);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Don't retry on validation/parse errors from our side
      if (lastError.message.includes("Invalid AI response structure")) {
        if (attempt < config.aiMaxRetries) {
          console.warn(
            `[ai-client] Invalid response for rule "${input.ruleId}", retrying (${attempt}/${config.aiMaxRetries})`
          );
          await sleep(1000 * Math.pow(2, attempt - 1));
          continue;
        }
        throw lastError;
      }

      // Retry on transient API errors (rate limits, 500s)
      if (attempt < config.aiMaxRetries) {
        const delay = 1000 * Math.pow(2, attempt - 1);
        console.warn(
          `[ai-client] API error for rule "${input.ruleId}", retrying in ${delay}ms (${attempt}/${config.aiMaxRetries}): ${lastError.message}`
        );
        await sleep(delay);
        continue;
      }
    }
  }

  throw lastError ?? new Error("AI generation failed after all retries");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
