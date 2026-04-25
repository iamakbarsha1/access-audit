import { describe, it, expect, vi, beforeEach } from "vitest";

describe("config", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function loadConfigWithEnv(env: Record<string, string | undefined>) {
    // Mock dotenv/config to prevent actual .env loading
    vi.doMock("dotenv/config", () => ({}));

    // Set environment variables before importing config
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    const { config } = await import("../config.js");
    return config;
  }

  // --- Default values ---

  it("uses default port 3001 when PORT is not set", async () => {
    const config = await loadConfigWithEnv({
      PORT: undefined,
      DATABASE_URL: "postgres://test",
      UPSTASH_REDIS_URL: "redis://test",
    });

    expect(config.port).toBe(3001);
  });

  it("uses default maxConcurrentTabs of 4", async () => {
    const config = await loadConfigWithEnv({
      MAX_CONCURRENT_TABS: undefined,
      DATABASE_URL: "postgres://test",
      UPSTASH_REDIS_URL: "redis://test",
    });

    expect(config.maxConcurrentTabs).toBe(4);
  });

  it("uses default pageTimeoutMs of 30000", async () => {
    const config = await loadConfigWithEnv({
      PAGE_TIMEOUT_MS: undefined,
      DATABASE_URL: "postgres://test",
      UPSTASH_REDIS_URL: "redis://test",
    });

    expect(config.pageTimeoutMs).toBe(30000);
  });

  it("uses default jobTimeoutMs of 600000", async () => {
    const config = await loadConfigWithEnv({
      JOB_TIMEOUT_MS: undefined,
      DATABASE_URL: "postgres://test",
      UPSTASH_REDIS_URL: "redis://test",
    });

    expect(config.jobTimeoutMs).toBe(600000);
  });

  it("uses default aiMaxViolationsPerPrompt of 20", async () => {
    const config = await loadConfigWithEnv({
      AI_MAX_VIOLATIONS_PER_PROMPT: undefined,
      DATABASE_URL: "postgres://test",
      UPSTASH_REDIS_URL: "redis://test",
    });

    expect(config.aiMaxViolationsPerPrompt).toBe(20);
  });

  it("uses default aiMaxRetries of 3", async () => {
    const config = await loadConfigWithEnv({
      AI_MAX_RETRIES: undefined,
      DATABASE_URL: "postgres://test",
      UPSTASH_REDIS_URL: "redis://test",
    });

    expect(config.aiMaxRetries).toBe(3);
  });

  it("uses default aiTimeoutMs of 30000", async () => {
    const config = await loadConfigWithEnv({
      AI_TIMEOUT_MS: undefined,
      DATABASE_URL: "postgres://test",
      UPSTASH_REDIS_URL: "redis://test",
    });

    expect(config.aiTimeoutMs).toBe(30000);
  });

  it("has hardcoded pageRetries of 2", async () => {
    const config = await loadConfigWithEnv({
      DATABASE_URL: "postgres://test",
      UPSTASH_REDIS_URL: "redis://test",
    });

    expect(config.pageRetries).toBe(2);
  });

  it("has hardcoded pageRetryDelayMs of 1000", async () => {
    const config = await loadConfigWithEnv({
      DATABASE_URL: "postgres://test",
      UPSTASH_REDIS_URL: "redis://test",
    });

    expect(config.pageRetryDelayMs).toBe(1000);
  });

  // --- Custom values via env ---

  it("reads PORT from environment", async () => {
    const config = await loadConfigWithEnv({
      PORT: "8080",
      DATABASE_URL: "postgres://test",
      UPSTASH_REDIS_URL: "redis://test",
    });

    expect(config.port).toBe(8080);
  });

  it("reads MAX_CONCURRENT_TABS from environment", async () => {
    const config = await loadConfigWithEnv({
      MAX_CONCURRENT_TABS: "8",
      DATABASE_URL: "postgres://test",
      UPSTASH_REDIS_URL: "redis://test",
    });

    expect(config.maxConcurrentTabs).toBe(8);
  });

  it("reads PAGE_TIMEOUT_MS from environment", async () => {
    const config = await loadConfigWithEnv({
      PAGE_TIMEOUT_MS: "60000",
      DATABASE_URL: "postgres://test",
      UPSTASH_REDIS_URL: "redis://test",
    });

    expect(config.pageTimeoutMs).toBe(60000);
  });

  it("reads JOB_TIMEOUT_MS from environment", async () => {
    const config = await loadConfigWithEnv({
      JOB_TIMEOUT_MS: "120000",
      DATABASE_URL: "postgres://test",
      UPSTASH_REDIS_URL: "redis://test",
    });

    expect(config.jobTimeoutMs).toBe(120000);
  });

  it("reads DATABASE_URL from environment", async () => {
    const config = await loadConfigWithEnv({
      DATABASE_URL: "postgres://mydb:5432/access_audit",
      UPSTASH_REDIS_URL: "redis://test",
    });

    expect(config.databaseUrl).toBe("postgres://mydb:5432/access_audit");
  });

  it("reads UPSTASH_REDIS_URL from environment", async () => {
    const config = await loadConfigWithEnv({
      DATABASE_URL: "postgres://test",
      UPSTASH_REDIS_URL: "redis://my-redis:6379",
    });

    expect(config.redisUrl).toBe("redis://my-redis:6379");
  });

  it("reads AI_MAX_VIOLATIONS_PER_PROMPT from environment", async () => {
    const config = await loadConfigWithEnv({
      AI_MAX_VIOLATIONS_PER_PROMPT: "50",
      DATABASE_URL: "postgres://test",
      UPSTASH_REDIS_URL: "redis://test",
    });

    expect(config.aiMaxViolationsPerPrompt).toBe(50);
  });

  it("reads AI_MAX_RETRIES from environment", async () => {
    const config = await loadConfigWithEnv({
      AI_MAX_RETRIES: "5",
      DATABASE_URL: "postgres://test",
      UPSTASH_REDIS_URL: "redis://test",
    });

    expect(config.aiMaxRetries).toBe(5);
  });

  it("reads AI_TIMEOUT_MS from environment", async () => {
    const config = await loadConfigWithEnv({
      AI_TIMEOUT_MS: "60000",
      DATABASE_URL: "postgres://test",
      UPSTASH_REDIS_URL: "redis://test",
    });

    expect(config.aiTimeoutMs).toBe(60000);
  });

  // --- AI provider selection ---

  it("selects anthropic provider when DEEPSEEK_API_KEY is not set", async () => {
    const config = await loadConfigWithEnv({
      DEEPSEEK_API_KEY: undefined,
      ANTHROPIC_API_KEY: "sk-ant-test",
      DATABASE_URL: "postgres://test",
      UPSTASH_REDIS_URL: "redis://test",
    });

    expect(config.aiProvider).toBe("anthropic");
  });

  it("selects deepseek provider when DEEPSEEK_API_KEY is set", async () => {
    const config = await loadConfigWithEnv({
      DEEPSEEK_API_KEY: "sk-ds-test",
      DATABASE_URL: "postgres://test",
      UPSTASH_REDIS_URL: "redis://test",
    });

    expect(config.aiProvider).toBe("deepseek");
  });

  // --- AI model selection ---

  it("uses claude-haiku-4-5-20251001 model when no DEEPSEEK_API_KEY and no AI_MODEL", async () => {
    const config = await loadConfigWithEnv({
      DEEPSEEK_API_KEY: undefined,
      AI_MODEL: undefined,
      DATABASE_URL: "postgres://test",
      UPSTASH_REDIS_URL: "redis://test",
    });

    expect(config.aiModel).toBe("claude-haiku-4-5-20251001");
  });

  it("uses deepseek-chat model when DEEPSEEK_API_KEY is set and no AI_MODEL", async () => {
    const config = await loadConfigWithEnv({
      DEEPSEEK_API_KEY: "sk-ds-test",
      AI_MODEL: undefined,
      DATABASE_URL: "postgres://test",
      UPSTASH_REDIS_URL: "redis://test",
    });

    expect(config.aiModel).toBe("deepseek-chat");
  });

  it("uses custom AI_MODEL when explicitly set", async () => {
    const config = await loadConfigWithEnv({
      AI_MODEL: "claude-3-opus-20240229",
      DATABASE_URL: "postgres://test",
      UPSTASH_REDIS_URL: "redis://test",
    });

    expect(config.aiModel).toBe("claude-3-opus-20240229");
  });

  it("AI_MODEL override takes precedence even when DEEPSEEK_API_KEY is set", async () => {
    const config = await loadConfigWithEnv({
      DEEPSEEK_API_KEY: "sk-ds-test",
      AI_MODEL: "custom-model-v2",
      DATABASE_URL: "postgres://test",
      UPSTASH_REDIS_URL: "redis://test",
    });

    expect(config.aiModel).toBe("custom-model-v2");
  });

  // --- API keys ---

  it("reads ANTHROPIC_API_KEY from environment", async () => {
    const config = await loadConfigWithEnv({
      ANTHROPIC_API_KEY: "sk-ant-secret",
      DATABASE_URL: "postgres://test",
      UPSTASH_REDIS_URL: "redis://test",
    });

    expect(config.anthropicApiKey).toBe("sk-ant-secret");
  });

  it("reads DEEPSEEK_API_KEY from environment", async () => {
    const config = await loadConfigWithEnv({
      DEEPSEEK_API_KEY: "sk-ds-secret",
      DATABASE_URL: "postgres://test",
      UPSTASH_REDIS_URL: "redis://test",
    });

    expect(config.deepseekApiKey).toBe("sk-ds-secret");
  });

  it("anthropicApiKey is undefined when not set", async () => {
    const config = await loadConfigWithEnv({
      ANTHROPIC_API_KEY: undefined,
      DATABASE_URL: "postgres://test",
      UPSTASH_REDIS_URL: "redis://test",
    });

    expect(config.anthropicApiKey).toBeUndefined();
  });

  it("deepseekApiKey is undefined when not set", async () => {
    const config = await loadConfigWithEnv({
      DEEPSEEK_API_KEY: undefined,
      DATABASE_URL: "postgres://test",
      UPSTASH_REDIS_URL: "redis://test",
    });

    expect(config.deepseekApiKey).toBeUndefined();
  });
});
