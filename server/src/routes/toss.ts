import type { FastifyInstance } from 'fastify';
import { persistenceMode } from '../db/persistence.js';
import { deleteUserData, upsertUser } from '../db/store.js';
import { getMtlsDiagnostics, isMtlsConfigured } from '../toss/mtls.js';
import {
  exchangeAuthorizationCode,
  removeAccessByUserKey,
} from '../toss/login.js';
import {
  DEFAULT_PUSH_CLEAR_CONTEXT,
  DEFAULT_PUSH_CONTEXT,
  DEFAULT_PUSH_END_SOON_CONTEXT,
  sendFunctionalMessage,
  sendTestFunctionalMessage,
} from '../toss/messenger.js';

function getPushStatus() {
  const templateCode = process.env.TOSS_PUSH_TEMPLATE_CODE?.trim();
  const clearTemplateCode = process.env.TOSS_PUSH_TEMPLATE_CODE_CLEAR?.trim();
  const endSoonTemplateCode = process.env.TOSS_PUSH_TEMPLATE_CODE_END_SOON?.trim();
  const deploymentId = process.env.TOSS_DEPLOYMENT_ID?.trim();
  const mtls = isMtlsConfigured();
  const missing: string[] = [];

  if (!mtls) missing.push('mTLS (MTLS_CERT_PEM_B64 / MTLS_KEY_PEM_B64)');
  if (!templateCode) missing.push('TOSS_PUSH_TEMPLATE_CODE (강수 예고, 콘솔 승인 후)');
  if (!clearTemplateCode) missing.push('TOSS_PUSH_TEMPLATE_CODE_CLEAR (강수 종료, 콘솔 승인 후)');
  if (!endSoonTemplateCode) {
    missing.push('TOSS_PUSH_TEMPLATE_CODE_END_SOON (강수 곧 종료, 콘솔 승인 후, 선택)');
  }
  if (!deploymentId) missing.push('TOSS_DEPLOYMENT_ID (최신 .ait deploymentId)');
  if (!process.env.CRON_SECRET?.trim()) missing.push('CRON_SECRET');

  return {
    ready: mtls && Boolean(templateCode) && Boolean(clearTemplateCode) && Boolean(deploymentId),
    db: persistenceMode(),
    mtls,
    templateConfigured: Boolean(templateCode),
    clearTemplateConfigured: Boolean(clearTemplateCode),
    endSoonTemplateConfigured: Boolean(endSoonTemplateCode),
    deploymentIdConfigured: Boolean(deploymentId),
    deploymentId: deploymentId ?? null,
    templates: {
      rain: {
        code: templateCode ?? null,
        body: '{{ msg }} 비 와요.',
        sampleContext: DEFAULT_PUSH_CONTEXT,
      },
      clear: {
        code: clearTemplateCode ?? null,
        body: '{{ msg }} 비 그쳤어요.',
        sampleContext: DEFAULT_PUSH_CLEAR_CONTEXT,
      },
      endSoon: {
        code: endSoonTemplateCode ?? null,
        body: '{{ msg }} 비 곧 그쳐요.',
        sampleContext: DEFAULT_PUSH_END_SOON_CONTEXT,
      },
    },
    cronHint: 'GitHub Actions notify-cron.yml (5분마다)',
    missing,
  };
}

export function registerTossRoutes(app: FastifyInstance): void {
  app.get('/toss/mtls-status', async () => ({
    apiBase: process.env.TOSS_API_BASE_URL ?? 'https://apps-in-toss-api.toss.im',
    ...getMtlsDiagnostics(),
  }));

  app.get('/toss/push-status', async () => getPushStatus());

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

        await upsertUser(userKey, true);
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

        await upsertUser(userKey, true);
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
      await deleteUserData(key);

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
        context: { ...DEFAULT_PUSH_CONTEXT, ...context },
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

  app.post<{
    Body: {
      userKey: string;
      kind?: 'rain' | 'clear' | 'end_soon';
      templateSetCode?: string;
      deploymentId?: string;
      context?: Record<string, string>;
    };
  }>('/toss/push/test', async (req, reply) => {
      const { userKey, kind = 'rain', templateSetCode, deploymentId, context } = req.body ?? {};
      const template =
        templateSetCode ??
        (kind === 'clear'
          ? process.env.TOSS_PUSH_TEMPLATE_CODE_CLEAR
          : kind === 'end_soon'
            ? process.env.TOSS_PUSH_TEMPLATE_CODE_END_SOON
            : process.env.TOSS_PUSH_TEMPLATE_CODE);
      const defaults =
        kind === 'clear'
          ? DEFAULT_PUSH_CLEAR_CONTEXT
          : kind === 'end_soon'
            ? DEFAULT_PUSH_END_SOON_CONTEXT
            : DEFAULT_PUSH_CONTEXT;
      if (!userKey || !template) {
        return reply.status(400).send({ error: 'userKey and templateSetCode required' });
      }

      try {
        const { status, data } = await sendTestFunctionalMessage({
          userKey,
          templateSetCode: template,
          deploymentId,
          context: { ...defaults, ...context },
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
