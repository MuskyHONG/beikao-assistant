import Fastify, { type FastifyError } from 'fastify';
import type pg from 'pg';
import { installAuth, type AuthOptions } from './auth.js';
import { installQuestionRoutes } from './question-routes.js';
import { HttpError } from './errors.js';

export interface Dependencies {
  ready: () => Promise<void>;
  version: string;
  logLevel?: string;
  pool?: pg.Pool;
  auth?: AuthOptions;
  trustProxyHops?: number;
}

export function buildApp({ ready, version, logLevel = 'silent', pool, auth, trustProxyHops = 0 }: Dependencies) {
  const app = Fastify({ trustProxy: (_address, hop) => hop < trustProxyHops, logger: logLevel === 'silent' ? false : {
    level: logLevel,
    redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers.x-csrf-token', 'res.headers.set-cookie'],
  }, bodyLimit: 1024 * 1024 });
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
  });
  app.get('/api/v1/health/live', async () => ({ status: 'ok', version }));
  app.get('/api/v1/health/ready', async (_request, reply) => {
    try {
      await ready();
      return { status: 'ready', version };
    } catch {
      // Never expose database hosts, credentials, or raw driver errors.
      return reply.code(503).send({ status: 'unavailable', version });
    }
  });
  app.get('/api/v1/version', async () => ({
    name: 'beikao-assistant', version, stage: 'accounts-and-shared-bank',
    capabilities: { authentication: !!pool, sharedQuestionBank: !!pool, cloudProgress: false, aiGrading: false },
  }));
  if (pool && auth) app.register(async scope => {
    const { guard } = await installAuth(scope, pool, auth);
    installQuestionRoutes(scope, pool, guard);
  });
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'not_found' }));
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error instanceof HttpError) return reply.code(error.statusCode).send({ error: error.code, ...(error.issues ? { issues: error.issues } : {}) });
    // Only the request identifier and generic error type go into production logs.
    request.log.error({ requestId: request.id, code: error.code ?? 'internal_error' }, 'Request failed');
    const status = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
    return reply.code(status).send({ error: status === 429 ? 'rate_limited' : status < 500 ? 'invalid_request' : 'internal_error' });
  });
  return app;
}
