import 'dotenv/config';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildApp } from '../dist/app.js';

type FastifyApp = Awaited<ReturnType<typeof buildApp>>;

let appPromise: Promise<FastifyApp> | null = null;

async function getApp(): Promise<FastifyApp> {
  if (!appPromise) appPromise = buildApp();
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getApp();
  await app.ready();
  app.server.emit('request', req, res);
}
