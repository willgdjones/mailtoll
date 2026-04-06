import { config } from './config';
import { runDeliveryWorker } from './services/delivery/worker';
import { pool } from './db';

// Suppress unused variable warning — config is loaded for side effects
void config;

const POLL_INTERVAL_MS = 10_000; // 10 seconds

async function main() {
  console.log(`[Worker] Starting with ${POLL_INTERVAL_MS / 1000}s poll interval`);

  while (true) {
    try {
      await runDeliveryWorker();
    } catch (err) {
      console.error('[Worker] Fatal error:', err);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main();
