export function readConfig(env: NodeJS.ProcessEnv) {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  try {
    const url = new URL(databaseUrl);
    if (!['postgresql:', 'postgres:'].includes(url.protocol) || !url.hostname) throw new Error();
  } catch { throw new Error('DATABASE_URL must be a PostgreSQL URL'); }
  const logLevel = env.LOG_LEVEL ?? 'info';
  if (!['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'].includes(logLevel)) throw new Error('Invalid LOG_LEVEL');
  const origin = env.APP_ORIGIN ?? 'http://127.0.0.1:4174';
  let url: URL;
  try { url = new URL(origin); if (!['http:','https:'].includes(url.protocol) || url.origin !== origin || url.username || url.password) throw new Error(); }
  catch { throw new Error('APP_ORIGIN must be an exact HTTP/HTTPS origin without a trailing slash'); }
  if (env.NODE_ENV === 'production' && url.protocol !== 'https:' && env.ALLOW_INSECURE_HTTP !== 'true') throw new Error('Production requires HTTPS APP_ORIGIN');
  const sessionHours = Number(env.SESSION_HOURS ?? 168), trustProxyHops = Number(env.TRUST_PROXY_HOPS ?? 0);
  if (!Number.isInteger(sessionHours) || sessionHours < 1 || sessionHours > 720) throw new Error('Invalid SESSION_HOURS');
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 5) throw new Error('Invalid TRUST_PROXY_HOPS');
  return { port, host: env.HOST ?? '127.0.0.1', databaseUrl, logLevel,
    auth: { origin, secureCookies: url.protocol === 'https:', sessionHours }, trustProxyHops };
}
