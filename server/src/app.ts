import cors from '@fastify/cors';
import Fastify from 'fastify';
import {
  addLocation,
  deleteLocation,
  listLocations,
  updateLocation,
  upsertUser,
} from './db/store.js';
import { buildLiveRelayReport } from './engine/liveRelay.js';
import { getCached, getStaleCached, setCache } from './kma/cache.js';
import { registerLegalRoutes } from './routes/legal.js';
import { registerCronRoutes } from './routes/cron.js';
import { registerGeocodeRoutes } from './routes/geocode.js';
import { registerForecastRoutes } from './routes/forecast.js';
import { registerTossRoutes } from './routes/toss.js';
import { persistenceMode } from './db/persistence.js';
import { isApihubConfigured } from './kma/apihub.js';
import { isMtlsConfigured } from './toss/mtls.js';

/** ~100m — align with app relayKey snap so nearby coords share cache */
function snapCoord(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function relayCacheKey(lat: number, lng: number): string {
  return `relay:${snapCoord(lat)}:${snapCoord(lng)}`;
}

export async function buildApp() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });
  registerLegalRoutes(app);
  registerGeocodeRoutes(app);
  registerTossRoutes(app);
  registerCronRoutes(app);
  registerForecastRoutes(app);

  app.get('/health', async () => ({
    ok: true,
    service: 'umbrella-server',
    mtls: isMtlsConfigured(),
    db: persistenceMode(),
    nowcast: {
      hsr: 'WthrRadarInfoService (DATA_GO_KR_SERVICE_KEY)',
      maple: isApihubConfigured() ? 'apihub' : 'needs KMA_APIHUB_AUTH_KEY',
    },
  }));

  app.get<{ Querystring: { lat: string; lng: string; name?: string } }>(
    '/relay',
    async (req, reply) => {
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return reply.status(400).send({ error: 'lat, lng required' });
      }
      try {
        const cacheKey = relayCacheKey(lat, lng);
        const cached = getCached<Awaited<ReturnType<typeof buildLiveRelayReport>>>(cacheKey);
        if (cached) return cached;

        const report = await buildLiveRelayReport({
          locationId: 'preview',
          locationName: req.query.name ?? '현재 위치',
          lat: snapCoord(lat),
          lng: snapCoord(lng),
        });
        setCache(cacheKey, report);
        return report;
      } catch (e) {
        req.log.error(e);
        const cacheKey = relayCacheKey(lat, lng);
        const stale = getStaleCached<Awaited<ReturnType<typeof buildLiveRelayReport>>>(cacheKey);
        if (stale) {
          req.log.warn({ cacheKey }, 'relay stale fallback after KMA error');
          return stale;
        }
        return reply.status(502).send({
          error: 'KMA fetch failed',
          message: e instanceof Error ? e.message : 'unknown',
        });
      }
    },
  );

  app.get<{ Querystring: { userKey: string } }>('/relay/all', async (req, reply) => {
    const { userKey } = req.query;
    if (!userKey) return reply.status(400).send({ error: 'userKey required' });

    const locations = await listLocations(userKey);
    if (locations.length === 0) {
      return { reports: [] };
    }

    const reports = await Promise.all(
      locations.map((loc) =>
        buildLiveRelayReport({
          locationId: loc.id,
          locationName: loc.name,
          lat: loc.lat,
          lng: loc.lng,
        }).catch(() => null),
      ),
    );

    return { reports: reports.filter(Boolean) };
  });

  app.post<{ Body: { userKey: string; notifyConsent: boolean } }>(
    '/users/register',
    async (req, reply) => {
      const { userKey, notifyConsent } = req.body ?? {};
      if (!userKey) return reply.status(400).send({ error: 'userKey required' });
      return upsertUser(String(userKey), Boolean(notifyConsent));
    },
  );

  app.get<{ Querystring: { userKey: string } }>('/locations', async (req) => {
    const userKey = req.query.userKey;
    if (!userKey) return [];
    return listLocations(userKey);
  });

  app.post<{
    Body: {
      userKey: string;
      name: string;
      lat: number;
      lng: number;
      address?: string;
      notifyEnabled?: boolean;
      notifyBeforeMin?: 30 | 60;
    };
  }>('/locations', async (req, reply) => {
    const { userKey, name, lat, lng, address, notifyEnabled = true, notifyBeforeMin = 30 } =
      req.body ?? {};
    if (!userKey || !name || lat == null || lng == null) {
      return reply.status(400).send({ error: 'userKey, name, lat, lng required' });
    }
    const locs = await listLocations(userKey);
    if (locs.length >= 5) {
      return reply.status(400).send({ error: 'max 5 locations' });
    }
    return addLocation(userKey, {
      name,
      lat,
      lng,
      ...(address?.trim() ? { address: address.trim() } : {}),
      notifyEnabled,
      notifyBeforeMin,
    });
  });

  app.put<{
    Params: { id: string };
    Body: Partial<{
      name: string;
      lat: number;
      lng: number;
      address: string;
      notifyEnabled: boolean;
      notifyBeforeMin: 30 | 60;
    }>;
    Querystring: { userKey: string };
  }>('/locations/:id', async (req, reply) => {
    const userKey = req.query.userKey;
    if (!userKey) return reply.status(400).send({ error: 'userKey required' });
    const updated = await updateLocation(userKey, req.params.id, req.body ?? {});
    if (!updated) return reply.status(404).send({ error: 'not found' });
    return updated;
  });

  app.delete<{ Params: { id: string }; Querystring: { userKey: string } }>(
    '/locations/:id',
    async (req, reply) => {
      const userKey = req.query.userKey;
      if (!userKey) return reply.status(400).send({ error: 'userKey required' });
      const ok = await deleteLocation(userKey, req.params.id);
      if (!ok) return reply.status(404).send({ error: 'not found' });
      return { ok: true };
    },
  );

  return app;
}
