import Redis from "ioredis";

function createRedis(): Redis {
  const url = process.env.UPSTASH_REDIS_URL;
  if (!url) throw new Error("UPSTASH_REDIS_URL is not set");
  return new Redis(url, {
    maxRetriesPerRequest: null,
    tls: url.startsWith("rediss://") ? {} : undefined,
  });
}

let _redis: Redis | undefined;

export const redis: Redis = new Proxy({} as Redis, {
  get(_target, prop, receiver) {
    if (!_redis) {
      _redis = createRedis();
    }
    const value = Reflect.get(_redis, prop, _redis);
    return typeof value === "function" ? value.bind(_redis) : value;
  },
  set(_target, prop, value) {
    if (!_redis) {
      _redis = createRedis();
    }
    return Reflect.set(_redis, prop, value);
  },
});
