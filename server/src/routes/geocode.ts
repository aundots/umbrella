import type { FastifyInstance } from 'fastify';
import { getCached, setCache } from '../kma/cache.js';
import { reverseGeocode } from '../geocode/nominatim.js';
import { searchPlaces } from '../geocode/search.js';
import type { GeocodePlace } from '../geocode/types.js';

export function registerGeocodeRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: { lat: string; lng: string } }>(
    '/geocode/reverse',
    async (req, reply) => {
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return reply.status(400).send({ error: 'lat, lng required' });
      }

      const cacheKey = `geocode:reverse:${lat.toFixed(4)}:${lng.toFixed(4)}`;
      const cached = getCached<GeocodePlace>(cacheKey);
      if (cached) return cached;

      try {
        const place = await reverseGeocode(lat, lng);
        setCache(cacheKey, place);
        return place;
      } catch (e) {
        req.log.error(e);
        return reply.status(502).send({ error: 'reverse geocode failed' });
      }
    },
  );

  app.get<{ Querystring: { q: string } }>('/geocode/search', async (req, reply) => {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2) {
      return reply.status(400).send({ error: 'q must be at least 2 characters' });
    }

    const cacheKey = `geocode:search:${q.toLowerCase()}`;
    const cached = getCached<GeocodePlace[]>(cacheKey);
    if (cached) return { results: cached };

    try {
      const results = await searchPlaces(q);
      setCache(cacheKey, results);
      return { results };
    } catch (e) {
      req.log.error(e);
      return reply.status(502).send({ error: 'place search failed' });
    }
  });
}
