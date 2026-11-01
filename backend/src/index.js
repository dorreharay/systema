import { createApp } from './app.js';
import { bootstrapAdmin } from './bootstrap.js';
import { assertConfig, config } from './config.js';
import { pool } from './db/index.js';

assertConfig();

try {
  await bootstrapAdmin();
} catch (err) {
  console.error('[bootstrap] Could not create the first admin:', err.message);
}

const server = createApp().listen(config.port, () => {
  console.log(`${config.appName} API listening on port ${config.port} (${config.nodeEnv})`);
});

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
