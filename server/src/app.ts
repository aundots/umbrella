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
import { getCached, setCache } from './kma/cache.js';
import { registerLegalRoutes } from './routes/legal.js';

export async function buildApp() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });
  registerLegalRoutes(app);

  app.get('/health', async () => ({ ok: true, service: 'umbrella-server' }));

  app.get<{ Querystring: { lat: string; lng: string; name?: string } }>(
    '/relay',
    async (req, reply) => {
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return reply.status(400).send({ error: 'lat, lng required' });
      }
      try {
        const cacheKey = `relay:${lat.toFixed(4)}:${lng.toFixed(4)}`;
        const cached = getCached<Awaited<ReturnType<typeof buildLiveRelayReport>>>(cacheKey);
        if (cached) return cached;

        const report = await buildLiveRelayReport({
          locationId: 'preview',
          locationName: req.query.name ?? '현재 위치',
          lat,
          lng,
        });
        setCache(cacheKey, report);
        return report;
      } catch (e) {
        req.log.error(e);
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

    const locations = listLocations(userKey);
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
      const user = upsertUser(String(userKey), Boolean(notifyConsent));
      return user;
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
      notifyEnabled?: boolean;
      notifyBeforeMin?: 30 | 60;
    };
  }>('/locations', async (req, reply) => {
    const { userKey, name, lat, lng, notifyEnabled = true, notifyBeforeMin = 30 } =
      req.body ?? {};
    if (!userKey || !name || lat == null || lng == null) {
      return reply.status(400).send({ error: 'userKey, name, lat, lng required' });
    }
    const locs = listLocations(userKey);
    if (locs.length >= 5) {
      return reply.status(400).send({ error: 'max 5 locations' });
    }
    return addLocation(userKey, { name, lat, lng, notifyEnabled, notifyBeforeMin });
  });

  app.put<{
    Params: { id: string };
    Body: Partial<{
      name: string;
      lat: number;
      lng: number;
      notifyEnabled: boolean;
      notifyBeforeMin: 30 | 60;
    }>;
    Querystring: { userKey: string };
  }>('/locations/:id', async (req, reply) => {
    const userKey = req.query.userKey;
    if (!userKey) return reply.status(400).send({ error: 'userKey required' });
    const updated = updateLocation(userKey, req.params.id, req.body ?? {});
    if (!updated) return reply.status(404).send({ error: 'not found' });
    return updated;
  });

  app.delete<{ Params: { id: string }; Querystring: { userKey: string } }>(
    '/locations/:id',
    async (req, reply) => {
      const userKey = req.query.userKey;
      if (!userKey) return reply.status(400).send({ error: 'userKey required' });
      const ok = deleteLocation(userKey, req.params.id);
      if (!ok) return reply.status(404).send({ error: 'not found' });
      return { ok: true };
    },
  );

  return app;
}
