import { config } from './config';
import { runDeliveryWorker } from './services/delivery/worker';
import { pool } from './db';

// Suppress unused variable warning — config is loaded for side effects
void config;

async function main() {
  try {
    await runDeliveryWorker();
  } catch (err) {
    console.error('[Worker] Fatal error:', err);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

main();
