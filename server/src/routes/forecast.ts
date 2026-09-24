import { FastifyInstance } from 'fastify';
import { getCached, setCache } from '../kma/cache.js';
import { fetchLocationWeather } from '../kma/client.js';
import { buildForecastDetail } from '../kma/forecastDetail.js';
import { fetchRadarFrames, proxyImagePath } from '../kma/radar.js';
const RADAR_IMG_BASE = 'http://www.kma.go.kr/repositary/image/rdr/img/';

export function registerForecastRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: { lat: string; lng: string } }>('/forecast', async (req, reply) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return reply.status(400).send({ error: 'lat, lng required' });
    }

    try {
      const cacheKey = `forecast:${lat.toFixed(4)}:${lng.toFixed(4)}`;
      const cached = getCached<Awaited<ReturnType<typeof buildForecastDetail>>>(cacheKey);
      if (cached) return cached;

      const { nx, ny, ncst, fcst } = await fetchLocationWeather(lat, lng);
      const detail = await buildForecastDetail(nx, ny, ncst, fcst);
      setCache(cacheKey, detail);
      return detail;
    } catch (e) {
      req.log.error(e);
      return reply.status(502).send({
        error: 'forecast fetch failed',
        message: e instanceof Error ? e.message : 'unknown',
      });
    }
  });

  app.get('/radar', async (req, reply) => {
    try {
      const cacheKey = 'radar:cmp_wrc';
      const cached = getCached<{
        frames: Array<{ time: string; file: string; imageUrl: string; proxyUrl: string }>;
        latestIndex: number;
      }>(cacheKey);
      if (cached) return cached;

      const frames = await fetchRadarFrames();
      const withProxy = frames.map((f) => ({
        ...f,
        proxyUrl: proxyImagePath(f.file),
      }));
      const result = {
        frames: withProxy,
        latestIndex: Math.max(0, withProxy.length - 1),
      };
      setCache(cacheKey, result);
      return result;
    } catch (e) {
      req.log.error(e);
      return reply.status(502).send({
        error: 'radar fetch failed',
        message: e instanceof Error ? e.message : 'unknown',
        hint: '공공데이터포털에서 "레이더영상 조회서비스" 활용신청이 필요할 수 있어요.',
      });
    }
  });

  app.get<{ Querystring: { file: string } }>('/radar/image', async (req, reply) => {
    const file = req.query.file;
    if (!file || file.includes('..') || file.includes('/')) {
      return reply.status(400).send({ error: 'file required' });
    }

    try {
      const url = `${RADAR_IMG_BASE}${file}`;
      const res = await fetch(url);
      if (!res.ok) return reply.status(502).send({ error: 'image fetch failed' });
      const buf = Buffer.from(await res.arrayBuffer());
      reply.header('Content-Type', res.headers.get('content-type') ?? 'image/png');
      reply.header('Cache-Control', 'public, max-age=300');
      return reply.send(buf);
    } catch (e) {
      req.log.error(e);
      return reply.status(502).send({ error: 'image proxy failed' });
    }
  });
}
