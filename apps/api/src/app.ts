import Fastify, { type FastifyError } from 'fastify';

export interface Dependencies {
  ready: () => Promise<void>;
  version: string;
  logLevel?: string;
}

export function buildApp({ ready, version, logLevel = 'silent' }: Dependencies) {
  const app = Fastify({ logger: logLevel === 'silent' ? false : {
    level: logLevel,
    redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'],
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
    name: 'beikao-assistant', version, stage: 'engineering-foundation',
    capabilities: { authentication: false, sharedQuestionBank: false, cloudProgress: false, aiGrading: false },
  }));
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'not_found' }));
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    // Only the request identifier and generic error type go into production logs.
    request.log.error({ requestId: request.id, code: error.code ?? 'internal_error' }, 'Request failed');
    const status = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
    return reply.code(status).send({ error: status < 500 ? 'invalid_request' : 'internal_error' });
  });
  return app;
}
