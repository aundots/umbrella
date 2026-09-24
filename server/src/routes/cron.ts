import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { listNotifyTargets } from '../db/store.js';
import { runNotifyScan } from '../notify/scheduler.js';
import { isNotifyPushEnabled, NOTIFY_PUSH_PAUSED_REASON } from '../notify/pushGate.js';
import { buildPushMsg, buildPushMsgClear, buildPushMsgEndSoon, formatDeliveryError, parseSendDelivery, sendFunctionalMessage } from '../toss/messenger.js';
import { isMtlsConfigured } from '../toss/mtls.js';

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
  // GET (GitHub Actions / 브라우저 테스트) + POST (QStash 기본 메서드) 모두 허용
  app.route({
    method: ['GET', 'POST'],
    url: '/cron/notify',
    handler: async (req, reply) => {
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
    },
  });

  /** CRON_SECRET 보호 — 실제 푸시 채널로 "비 온다" 테스트 (날씨 무관) */
  app.post<{ Body: { kind?: 'rain' | 'clear' | 'end_soon' } }>(
    '/cron/notify/test-push',
    async (req, reply) => {
      if (!verifyCronAuth(req, reply)) return;

      const kind = req.body?.kind ?? 'rain';
      if (!isNotifyPushEnabled()) {
        return reply.status(503).send({
          error: 'notify_push_paused',
          message: NOTIFY_PUSH_PAUSED_REASON,
        });
      }
      if (!isMtlsConfigured()) {
        return reply.status(503).send({ error: 'mTLS not configured' });
      }

      const templateByKind = {
        rain: process.env.TOSS_PUSH_TEMPLATE_CODE?.trim(),
        clear: process.env.TOSS_PUSH_TEMPLATE_CODE_CLEAR?.trim(),
        end_soon: process.env.TOSS_PUSH_TEMPLATE_CODE_END_SOON?.trim(),
      } as const;
      const template = templateByKind[kind];
      if (!template) {
        return reply.status(503).send({ error: `template not configured for ${kind}` });
      }

      const targets = await listNotifyTargets();
      const results: Array<{
        userKey: string;
        location: string;
        msg: string;
        ok: boolean;
        error?: string;
      }> = [];

      for (const { userKey, locations } of targets) {
        for (const loc of locations) {
          let msg: string;
          if (kind === 'clear') {
            msg = buildPushMsgClear(loc.name);
          } else if (kind === 'end_soon') {
            msg = buildPushMsgEndSoon(loc.name, 30);
          } else {
            msg = buildPushMsg(loc.name, {
              relayStatus: 'approaching',
              now: { precipitating: false },
              arrival: { inMinutes: 30 },
            });
          }

          try {
            const { data } = await sendFunctionalMessage({
              userKey,
              templateSetCode: template,
              context: { msg },
            });
            const delivery = parseSendDelivery(data);
            results.push({
              userKey,
              location: loc.name,
              msg,
              ok: delivery.delivered,
              error:
                formatDeliveryError(delivery) ??
                data.error?.reason ??
                (delivery.accepted ? 'sentPushCount=0' : undefined),
            });
          } catch (e) {
            results.push({
              userKey,
              location: loc.name,
              msg,
              ok: false,
              error: e instanceof Error ? e.message : 'unknown',
            });
          }
        }
      }

      const sent = results.filter((r) => r.ok).length;
      return {
        ok: sent > 0,
        kind,
        targets: targets.length,
        locations: results.length,
        sent,
        failed: results.length - sent,
        results,
        at: new Date().toISOString(),
      };
    },
  );
}
