import { buildApp } from './app.js';
import { readConfig } from './config.js';
import { checkDatabase, createDatabase } from './database.js';
import { version } from './version.js';

const config = readConfig(process.env);
const pool = createDatabase(config.databaseUrl);
const app = buildApp({ ready: () => checkDatabase(pool), version, logLevel: config.logLevel, pool, auth: config.auth, trustProxyHops: config.trustProxyHops });
// Unexpected pool errors must not become unhandled events or expose credentials.
pool.on('error', () => app.log.error('Idle database connection failed'));
app.addHook('onClose', () => pool.end());
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await app.close();
}
process.on('SIGTERM', () => { void shutdown(); });
process.on('SIGINT', () => { void shutdown(); });
try { await app.listen({ port: config.port, host: config.host }); }
catch { app.log.error('API startup failed'); await app.close(); process.exitCode = 1; }
