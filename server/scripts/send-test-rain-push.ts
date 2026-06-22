/**
 * 프로덕션 /cron/notify/test-push 호출 — "30분 후 비" 실제 푸시
 * npm run notify:test-push --prefix server
 * npm run notify:test-push --prefix server -- --kind=clear
 */
import 'dotenv/config';

const API =
  process.env.NOTIFY_CRON_URL?.trim().replace(/\/cron\/notify$/, '') ||
  'https://umbrella-three-iota.vercel.app';
const CRON_SECRET = process.env.CRON_SECRET?.replace(/^["']|["']$/g, '').trim();

async function main(): Promise<void> {
  if (!CRON_SECRET) {
    console.error('[TEST-PUSH] server/.env 에 CRON_SECRET 필요');
    process.exit(1);
  }

  const kindArg = process.argv.find((a) => a.startsWith('--kind='));
  const kind = (kindArg?.split('=')[1] ?? 'rain') as 'rain' | 'clear' | 'end_soon';

  console.log(`[TEST-PUSH] POST ${API}/cron/notify/test-push kind=${kind}\n`);

  const res = await fetch(`${API}/cron/notify/test-push`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CRON_SECRET}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ kind }),
  });

  const data = (await res.json()) as {
    ok?: boolean;
    sent?: number;
    failed?: number;
    locations?: number;
    results?: Array<{ userKey: string; location: string; msg: string; ok: boolean; error?: string }>;
    error?: string;
    message?: string;
  };

  if (!res.ok) {
    console.error(`HTTP ${res.status}`, data);
    process.exit(1);
  }

  for (const r of data.results ?? []) {
    const mark = r.ok ? '✅' : '❌';
    console.log(`${mark} user=${r.userKey} [${r.location}] "${r.msg}"${r.error ? ` — ${r.error}` : ''}`);
  }

  console.log(
    `\n[TEST-PUSH] sent=${data.sent}/${data.locations} failed=${data.failed} ok=${data.ok}`,
  );

  if (!data.ok) process.exit(1);
}

main();
