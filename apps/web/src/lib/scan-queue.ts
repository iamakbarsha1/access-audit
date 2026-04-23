import { Queue } from "bullmq";
import { redis } from "./redis";

export interface ScanJobData {
  scanId: string;
  siteId: string;
  url: string;
  maxPages: number;
}

export const scanQueue = new Queue<ScanJobData>("scan", {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 30000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});
