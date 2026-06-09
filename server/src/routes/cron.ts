import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { runNotifyScan } from '../notify/scheduler.js';

function verifyCronAuth(req: FastifyRequest, reply: FastifyReply): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    if (!process.env.VERCEL) return true;
    reply.status(503).send({ error: 'CRON_SECRET not configured' });
    return false;
  }

  const auth = req.headers.authorization;
  if (auth !== `Bearer ${secret}`) {
    reply.status(401).send({ error: 'unauthorized' });
    return false;
  }
  return true;
}

export function registerCronRoutes(app: FastifyInstance): void {
  app.get('/cron/notify', async (req, reply) => {
    if (!verifyCronAuth(req, reply)) return;

    try {
      const result = await runNotifyScan();
      const payload = {
        ok: true,
        ...result,
        at: new Date().toISOString(),
      };
      if (result.errors > 0) {
        req.log.warn({ result }, 'notify scan completed with location errors');
      }
      return payload;
    } catch (e) {
      req.log.error(e);
      return reply.status(500).send({
        error: 'notify_scan_failed',
        message: e instanceof Error ? e.message : 'unknown',
      });
    }
  });
}
