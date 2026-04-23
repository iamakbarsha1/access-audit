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
} as const;
