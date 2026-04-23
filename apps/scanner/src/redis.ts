import Redis from "ioredis";
import { config } from "./config.js";

export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null, // Required by BullMQ
});

// Separate connection for pub/sub (pub/sub connections can't be used for commands)
export const redisPub = new Redis(config.redisUrl);
