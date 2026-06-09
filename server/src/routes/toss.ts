import type { FastifyInstance } from 'fastify';
import { deleteUserData, upsertUser } from '../db/store.js';
import { isMtlsConfigured } from '../toss/mtls.js';
import {
  exchangeAuthorizationCode,
  removeAccessByUserKey,
} from '../toss/login.js';
import { sendFunctionalMessage, sendTestFunctionalMessage } from '../toss/messenger.js';

export function registerTossRoutes(app: FastifyInstance): void {
  app.get('/toss/mtls-status', async () => ({
    configured: isMtlsConfigured(),
    apiBase: process.env.TOSS_API_BASE_URL ?? 'https://apps-in-toss-api.toss.im',
  }));

  app.post<{ Body: { authorizationCode: string; referrer: string } }>(
    '/toss/auth/session',
    async (req, reply) => {
      const { authorizationCode, referrer } = req.body ?? {};
      if (!authorizationCode || !referrer) {
        return reply.status(400).send({ error: 'authorizationCode and referrer required' });
      }

      try {
        const { tokenRes, meRes, userKey } = await exchangeAuthorizationCode({
          authorizationCode,
          referrer,
        });

        if (!userKey) {
          return reply.status(tokenRes.status >= 400 ? tokenRes.status : 502).send({
            resultType: 'FAIL',
            error: tokenRes.data.error ?? meRes?.data.error ?? { reason: 'userKey not found' },
          });
        }

        upsertUser(userKey, true);
        return {
          userKey,
          scope: meRes?.data.success?.scope,
        };
      } catch (e) {
        req.log.error(e);
        return reply.status(503).send({
          error: 'toss_auth_failed',
          message: e instanceof Error ? e.message : 'unknown',
        });
      }
    },
  );

  /** @deprecated use /toss/auth/session */
  app.post<{ Body: { authorizationCode: string; referrer: string } }>(
    '/toss/auth/token',
    async (req, reply) => {
      const { authorizationCode, referrer } = req.body ?? {};
      if (!authorizationCode || !referrer) {
        return reply.status(400).send({ error: 'authorizationCode and referrer required' });
      }

      try {
        const { tokenRes, meRes, userKey } = await exchangeAuthorizationCode({
          authorizationCode,
          referrer,
        });

        if (!userKey) {
          return reply.status(tokenRes.status >= 400 ? tokenRes.status : 502).send(tokenRes.data);
        }

        upsertUser(userKey, true);
        return { userKey, scope: meRes?.data.success?.scope };
      } catch (e) {
        req.log.error(e);
        return reply.status(503).send({
          error: 'toss_auth_failed',
          message: e instanceof Error ? e.message : 'unknown',
        });
      }
    },
  );

  app.post<{ Body: { userKey: string | number; referrer?: string } }>(
    '/toss/unlink',
    async (req, reply) => {
      const userKey = req.body?.userKey;
      if (userKey == null || userKey === '') {
        return reply.status(400).send({ error: 'userKey required' });
      }

      const key = String(userKey);
      deleteUserData(key);

      if (isMtlsConfigured()) {
        try {
          await removeAccessByUserKey(key);
        } catch (e) {
          req.log.warn(e, 'toss unlink api call failed');
        }
      }

      req.log.info({ userKey: key, referrer: req.body?.referrer }, 'toss unlink callback');
      return { ok: true, userKey: key };
    },
  );

  app.post<{
    Body: { userKey: string; templateSetCode?: string; context?: Record<string, string> };
  }>('/toss/push/send', async (req, reply) => {
    const { userKey, templateSetCode, context } = req.body ?? {};
    const template = templateSetCode ?? process.env.TOSS_PUSH_TEMPLATE_CODE;
    if (!userKey || !template) {
      return reply.status(400).send({ error: 'userKey and templateSetCode required' });
    }

    try {
      const { status, data } = await sendFunctionalMessage({
        userKey,
        templateSetCode: template,
        context: context ?? {},
      });
      return reply.status(status).send(data);
    } catch (e) {
      req.log.error(e);
      return reply.status(503).send({
        error: 'toss_push_failed',
        message: e instanceof Error ? e.message : 'unknown',
      });
    }
  });

  app.post<{ Body: { templateSetCode?: string; context?: Record<string, string> } }>(
    '/toss/push/test',
    async (req, reply) => {
      const template = req.body?.templateSetCode ?? process.env.TOSS_PUSH_TEMPLATE_CODE;
      if (!template) {
        return reply.status(400).send({ error: 'templateSetCode required' });
      }

      try {
        const { status, data } = await sendTestFunctionalMessage({
          templateSetCode: template,
          context: req.body?.context ?? {},
        });
        return reply.status(status).send(data);
      } catch (e) {
        req.log.error(e);
        return reply.status(503).send({
          error: 'toss_push_test_failed',
          message: e instanceof Error ? e.message : 'unknown',
        });
      }
    },
  );
}
