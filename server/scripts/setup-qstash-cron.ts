import 'dotenv/config';

/**
 * QStash(Upstash) 스케줄을 만들어 알림 스캔(/cron/notify)을 주기적으로 호출한다.
 *
 * GitHub Actions 예약 워크플로우는 무료 플랜에서 30분~2시간씩 지연/누락되어
 * 비 시작/그침 전이를 놓친다. QStash는 분 단위로 안정적으로 HTTP를 호출한다.
 *
 * 필요 env:
 *   QSTASH_TOKEN   - https://console.upstash.com/qstash 의 QSTASH_TOKEN
 *   CRON_SECRET    - 서버(Vercel)의 CRON_SECRET 과 동일 값 (대상에 Bearer로 전달됨)
 * 필요 env:
 *   QSTASH_TOKEN   - https://console.upstash.com/qstash 의 QSTASH_TOKEN
 *   CRON_SECRET    - 서버(Vercel)의 CRON_SECRET 과 동일 값 (대상에 Bearer로 전달됨)
 * 선택 env:
 *   QSTASH_URL      - 콘솔에 표시된 URL (US: https://qstash-us-east-1.upstash.io)
 *   NOTIFY_CRON_URL - 기본 https://umbrella-three-iota.vercel.app/cron/notify
 *   QSTASH_CRON     - 기본 5분마다 (약 288회/일, 무료 한도 500 이내)
 *
 * 실행: npm run qstash:setup --prefix server
 */

function stripQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, '').trim();
}

function getQstashBase(): string {
  const raw = process.env.QSTASH_URL ? stripQuotes(process.env.QSTASH_URL) : '';
  const host = raw || 'https://qstash.upstash.io';
  const normalized = host.replace(/\/$/, '');
  return normalized.endsWith('/v2') ? normalized : `${normalized}/v2`;
}

interface ScheduleInfo {
  scheduleId: string;
  destination: string;
  cron: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) {
    console.error(`[QSTASH] 환경변수 ${name} 가 필요합니다.`);
    process.exit(1);
  }
  return stripQuotes(value);
}

async function listSchedules(token: string, qstashBase: string): Promise<ScheduleInfo[]> {
  const res = await fetch(`${qstashBase}/schedules`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`목록 조회 실패 (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as ScheduleInfo[];
}

async function deleteSchedule(
  token: string,
  scheduleId: string,
  qstashBase: string,
): Promise<void> {
  const res = await fetch(`${qstashBase}/schedules/${scheduleId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`삭제 실패 ${scheduleId} (${res.status}): ${await res.text()}`);
  }
}

async function createSchedule(
  token: string,
  destination: string,
  cron: string,
  forwardAuth: string,
  qstashBase: string,
): Promise<string> {
  const res = await fetch(`${qstashBase}/schedules/${destination}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Upstash-Cron': cron,
      'Upstash-Method': 'POST',
      // 대상(/cron/notify)으로 그대로 전달될 헤더 → 서버의 CRON_SECRET 인증 통과
      'Upstash-Forward-Authorization': `Bearer ${forwardAuth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    throw new Error(`스케줄 생성 실패 (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { scheduleId: string };
  return data.scheduleId;
}

async function main(): Promise<void> {
  const qstashBase = getQstashBase();
  const token = requireEnv('QSTASH_TOKEN');

  console.log(`[QSTASH] API: ${qstashBase}`);

  if (process.argv.includes('--list')) {
    const schedules = await listSchedules(token, qstashBase);
    if (schedules.length === 0) {
      console.log('[QSTASH] 등록된 스케줄이 없습니다.');
      return;
    }
    for (const s of schedules) {
      console.log(`- ${s.scheduleId}  ${s.cron}  → ${s.destination}`);
    }
    return;
  }

  const destination =
    process.env.NOTIFY_CRON_URL?.trim() ||
    'https://umbrella-three-iota.vercel.app/cron/notify';

  if (process.argv.includes('--pause')) {
    const existing = await listSchedules(token, qstashBase);
    const targets = existing.filter((s) => s.destination === destination);
    if (targets.length === 0) {
      console.log('[QSTASH] 중단할 스케줄이 없습니다 (이미 중단됨).');
      return;
    }
    for (const s of targets) {
      console.log(`[QSTASH] 스케줄 삭제: ${s.scheduleId} (${s.cron})`);
      await deleteSchedule(token, s.scheduleId, qstashBase);
    }
    console.log('[QSTASH] 알림 크론 스케줄 중단 완료 ✅');
    return;
  }

  const cronSecret = requireEnv('CRON_SECRET');
  const cron = process.env.QSTASH_CRON?.trim() || '*/5 * * * *';

  console.log(`[QSTASH] 대상: ${destination}`);
  console.log(`[QSTASH] 주기: ${cron}`);

  const existing = await listSchedules(token, qstashBase);
  const dupes = existing.filter((s) => s.destination === destination);
  for (const dupe of dupes) {
    console.log(`[QSTASH] 기존 스케줄 삭제: ${dupe.scheduleId} (${dupe.cron})`);
    await deleteSchedule(token, dupe.scheduleId, qstashBase);
  }

  const scheduleId = await createSchedule(
    token,
    destination,
    cron,
    cronSecret,
    qstashBase,
  );
  console.log(`[QSTASH] 스케줄 생성 완료 ✅  scheduleId=${scheduleId}`);
  console.log('[QSTASH] 콘솔에서 확인: https://console.upstash.com/qstash');
}

main().catch((e) => {
  console.error('[QSTASH] 실패:', e instanceof Error ? e.message : e);
  process.exit(1);
});
