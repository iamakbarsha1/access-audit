import Redis from "ioredis";
import { config } from "./config.js";

const redisOpts = {
  maxRetriesPerRequest: null, // Required by BullMQ
  tls: config.redisUrl.startsWith("rediss://") ? {} : undefined,
};

export const redis = new Redis(config.redisUrl, redisOpts);

// Separate connection for pub/sub (pub/sub connections can't be used for commands)
export const redisPub = new Redis(config.redisUrl, {
  tls: redisOpts.tls,
});
