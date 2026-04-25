import Redis from "ioredis";

let _redis: Redis | null = null;

export const redis = new Proxy({} as Redis, {
  get(_target, prop) {
    if (!_redis) {
      const url = process.env.UPSTASH_REDIS_URL;
      if (!url) throw new Error("UPSTASH_REDIS_URL is not set");
      _redis = new Redis(url, { maxRetriesPerRequest: null });
    }
    return (_redis as Record<string | symbol, unknown>)[prop];
  },
});
