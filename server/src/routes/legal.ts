import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { FastifyInstance } from 'fastify';

const LEGAL_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../public/legal');

function readLegalPage(filename: string): string | null {
  const path = join(LEGAL_DIR, filename);
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf-8');
}

export function registerLegalRoutes(app: FastifyInstance): void {
  app.get('/legal/terms', async (_req, reply) => {
    const html = readLegalPage('terms.html');
    if (!html) return reply.status(404).send('Not found');
    return reply.type('text/html; charset=utf-8').send(html);
  });

  app.get('/legal/privacy', async (_req, reply) => {
    const html = readLegalPage('privacy.html');
    if (!html) return reply.status(404).send('Not found');
    return reply.type('text/html; charset=utf-8').send(html);
  });
}
