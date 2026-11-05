import { createApp } from './app.js';
import { bootstrapAdmin } from './bootstrap.js';
import { assertConfig, config } from './config.js';
import { pool } from './db/index.js';
import { purgeOperations } from './utils/operations.js';

assertConfig();

try {
  await bootstrapAdmin();
} catch (err) {
  console.error('[bootstrap] Could not create the first admin:', err.message);
}

const server = createApp().listen(config.port, () => {
  console.log(`${config.appName} API listening on port ${config.port} (${config.nodeEnv})`);
});

// The keys of the stock changes that the phones have sent (see utils/operations.js): the old ones are deleted now and then. The timer
// does not keep the process alive.
const purge = () =>
  purgeOperations().catch((err) => console.error('[operations] Could not delete the old keys:', err.message));
void purge();
setInterval(purge, 24 * 60 * 60 * 1000).unref();

// The host stops a container with SIGTERM. Finish the requests in flight and close the database
// connections instead of cutting them.
let stopping = false;
function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal} received, shutting down...`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
