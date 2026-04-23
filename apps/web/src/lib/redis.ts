import Redis from "ioredis";

const getRedisUrl = () => {
  const url = process.env.UPSTASH_REDIS_URL;
  if (!url) throw new Error("UPSTASH_REDIS_URL is not set");
  return url;
};

export const redis = new Redis(getRedisUrl(), {
  maxRetriesPerRequest: null,
});
