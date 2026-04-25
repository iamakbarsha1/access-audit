import "dotenv/config";

export const config = {
  databaseUrl: process.env.DATABASE_URL!,
  redisUrl: process.env.UPSTASH_REDIS_URL!,
  port: parseInt(process.env.PORT || "3001", 10),
  maxConcurrentTabs: parseInt(process.env.MAX_CONCURRENT_TABS || "4", 10),
  pageTimeoutMs: parseInt(process.env.PAGE_TIMEOUT_MS || "30000", 10),
  jobTimeoutMs: parseInt(process.env.JOB_TIMEOUT_MS || "600000", 10),
  pageRetries: 2,
  pageRetryDelayMs: 1000,
  // AI configuration — supports DeepSeek (default, cheaper) or Anthropic Claude
  deepseekApiKey: process.env.DEEPSEEK_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  aiProvider: (process.env.DEEPSEEK_API_KEY ? "deepseek" : "anthropic") as "deepseek" | "anthropic",
  aiModel: process.env.AI_MODEL || (process.env.DEEPSEEK_API_KEY ? "deepseek-chat" : "claude-haiku-4-5-20251001"),
  aiMaxViolationsPerPrompt: parseInt(process.env.AI_MAX_VIOLATIONS_PER_PROMPT || "20", 10),
  aiMaxRetries: parseInt(process.env.AI_MAX_RETRIES || "3", 10),
  aiTimeoutMs: parseInt(process.env.AI_TIMEOUT_MS || "30000", 10),
} as const;
