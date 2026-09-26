/**
 * 알림 파이프라인 내부 점검
 * npm run notify:test --prefix server
 */
import 'dotenv/config';

const API = process.env.NOTIFY_CRON_URL?.trim().replace(/\/cron\/notify$/, '') ||
  'https://umbrella-three-iota.vercel.app';
const CRON_URL = `${API}/cron/notify`;
const CRON_SECRET = process.env.CRON_SECRET?.replace(/^["']|["']$/g, '').trim();
const QSTASH_TOKEN = process.env.QSTASH_TOKEN?.replace(/^["']|["']$/g, '').trim();
const QSTASH_URL = (process.env.QSTASH_URL?.replace(/^["']|["']$/g, '').trim() ||
  'https://qstash-us-east-1.upstash.io').replace(/\/$/, '');

type Result = { name: string; ok: boolean; detail: string };

async function check(name: string, fn: () => Promise<{ ok: boolean; detail: string }>): Promise<Result> {
  try {
    const { ok, detail } = await fn();
    return { name, ok, detail };
  } catch (e) {
    return { name, ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

async function main(): Promise<void> {
  const results: Result[] = [];

  results.push(
    await check('push-status (mTLS·템플릿)', async () => {
      const res = await fetch(`${API}/toss/push-status`);
      const data = (await res.json()) as { ready?: boolean; missing?: string[]; mtls?: boolean };
      const ok = res.ok && data.ready === true && data.mtls === true;
      return {
        ok,
        detail: ok
          ? 'ready, mTLS OK, rain/clear 템플릿 설정됨'
          : `ready=${data.ready}, missing=${data.missing?.join(', ') ?? '?'}`,
      };
    }),
  );

  results.push(
    await check('cron POST — 인증 없음 → 401', async () => {
      const res = await fetch(CRON_URL, { method: 'POST', body: '{}' });
      return { ok: res.status === 401, detail: `HTTP ${res.status}` };
    }),
  );

  if (!CRON_SECRET) {
    results.push({ name: 'cron POST — CRON_SECRET 스캔', ok: false, detail: 'CRON_SECRET 없음' });
  } else {
    results.push(
      await check('cron POST — 인증 OK → 200 + 스캔', async () => {
        const res = await fetch(CRON_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${CRON_SECRET}`,
            'Content-Type': 'application/json',
          },
          body: '{}',
        });
        const data = (await res.json()) as {
          ok?: boolean;
          users?: number;
          locations?: number;
          errors?: number;
          durationMs?: number;
        };
        const ok = res.ok && data.ok === true && (data.errors ?? 0) === 0;
        return {
          ok,
          detail: `HTTP ${res.status} users=${data.users} locs=${data.locations} errors=${data.errors} ${data.durationMs}ms`,
        };
      }),
    );

    results.push(
      await check('cron GET — QStash와 동일 Bearer', async () => {
        const res = await fetch(CRON_URL, {
          headers: { Authorization: `Bearer ${CRON_SECRET}` },
        });
        const data = (await res.json()) as { ok?: boolean };
        return { ok: res.ok && data.ok === true, detail: `HTTP ${res.status}` };
      }),
    );
  }

  if (!QSTASH_TOKEN) {
    results.push({ name: 'QStash 스케줄 등록', ok: false, detail: 'QSTASH_TOKEN 없음' });
  } else {
    results.push(
      await check('QStash 스케줄 — /cron/notify 5분', async () => {
        const res = await fetch(`${QSTASH_URL}/v2/schedules`, {
          headers: { Authorization: `Bearer ${QSTASH_TOKEN}` },
        });
        if (!res.ok) {
          return { ok: false, detail: `HTTP ${res.status} ${(await res.text()).slice(0, 120)}` };
        }
        const schedules = (await res.json()) as Array<{ destination: string; cron: string }>;
        const hit = schedules.find((s) => s.destination === CRON_URL);
        return {
          ok: Boolean(hit),
          detail: hit
            ? `등록됨 cron=${hit.cron} (총 ${schedules.length}개)`
            : `스케줄 없음 (등록된 ${schedules.length}개)`,
        };
      }),
    );

    if (CRON_SECRET) {
      results.push(
        await check('QStash 1회 즉시 호출 (publish)', async () => {
          const res = await fetch(`${QSTASH_URL}/v2/publish/${CRON_URL}`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${QSTASH_TOKEN}`,
              'Upstash-Method': 'POST',
              'Upstash-Forward-Authorization': `Bearer ${CRON_SECRET}`,
              'Content-Type': 'application/json',
            },
            body: '{}',
          });
          const text = await res.text();
          const ok = res.ok;
          return {
            ok,
            detail: ok ? `messageId=${JSON.parse(text).messageId ?? 'queued'}` : `HTTP ${res.status} ${text.slice(0, 100)}`,
          };
        }),
      );
    }
  }

  results.push(
    await check('notify/ack 라우트', async () => {
      const res = await fetch(`${API}/notify/ack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userKey: '0000000000' }),
      });
      const data = (await res.json()) as { acked?: number };
      return {
        ok: res.ok && typeof data.acked === 'number',
        detail: `HTTP ${res.status} acked=${data.acked}`,
      };
    }),
  );

  console.log('\n=== 알림 파이프라인 내부 테스트 ===\n');
  let pass = 0;
  for (const r of results) {
    const mark = r.ok ? '✅' : '❌';
    console.log(`${mark} ${r.name}`);
    console.log(`   ${r.detail}\n`);
    if (r.ok) pass += 1;
  }
  console.log(`결과: ${pass}/${results.length} 통과\n`);

  if (pass < results.length) process.exit(1);
}

main();
