import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { FastifyInstance } from 'fastify';

function resolveLegalDir(): string {
  const candidates = [
    join(process.cwd(), 'server/public/legal'),
    join(process.cwd(), 'public/legal'),
    join(dirname(fileURLToPath(import.meta.url)), '../../public/legal'),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, 'terms.html'))) return dir;
  }
  return candidates[0];
}

const LEGAL_DIR = resolveLegalDir();

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
