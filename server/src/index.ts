import 'dotenv/config';
import { buildApp } from './app.js';
import { runNotifyScan } from './notify/scheduler.js';

const app = await buildApp();
const port = Number(process.env.PORT ?? 3001);
await app.listen({ port, host: '0.0.0.0' });
console.log(`umbrella-server listening on :${port}`);

setInterval(() => {
  runNotifyScan().catch((e) => console.error('[NOTIFY]', e));
}, 5 * 60 * 1000);
