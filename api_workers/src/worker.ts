// ABOUTME: Single API worker entry point configured via environment variables.
// ABOUTME: Instantiates BaseApiWorker with QUEUE_NAME, MIN_DELAY_MS, and LOG_PREFIX from env.

import { BaseApiWorker } from "./base-api-worker.js";

const queueName = process.env.QUEUE_NAME;
const minDelayMs = parseInt(process.env.MIN_DELAY_MS || "1000", 10);
const logPrefix = process.env.LOG_PREFIX || "API_WORKER";

if (!queueName) {
  console.error(`[${logPrefix}] QUEUE_NAME environment variable is required`);
  process.exit(1);
}

const worker = new BaseApiWorker({
  queueName,
  minDelayMs,
  logPrefix,
});

worker.run();
