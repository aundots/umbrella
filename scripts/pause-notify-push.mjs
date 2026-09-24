#!/usr/bin/env node
/**
 * 토스 기능성 캠페인 재생성 전 — 서버 푸시 발송 완전 중단
 * - Vercel NOTIFY_PUSH_ENABLED=false
 * - QStash /cron/notify 스케줄 삭제
 * - production 재배포
 *
 * 재개: node scripts/resume-notify-push.mjs
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_KEY = 'NOTIFY_PUSH_ENABLED';
const ENV_VALUE = 'false';

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['pipe', 'pipe', 'pipe'],
    ...opts,
  });
}

function vercel(args, input) {
  const result = run('npx', ['--yes', 'vercel', ...args], { input: input ?? undefined });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || '').trim() || `vercel failed`);
  }
  return (result.stdout || '').trim();
}

function upsertEnv(key, value) {
  let list = '';
  try {
    list = vercel(['env', 'ls']);
  } catch {
    // empty project
  }
  if (new RegExp(`\\b${key}\\b`).test(list)) {
    for (const target of ['production', 'preview', 'development']) {
      try {
        vercel(['env', 'rm', key, target, '--yes']);
      } catch {
        // skip
      }
    }
  }
  for (const target of ['production', 'preview', 'development']) {
    vercel(['env', 'add', key, target], `${value}\n`);
    console.log(`[pause-notify] ${key}=${value} (${target})`);
  }
}

async function verifyPaused() {
  for (let i = 0; i < 12; i += 1) {
    await new Promise((r) => setTimeout(r, 10_000));
    try {
      const res = await fetch('https://umbrella-three-iota.vercel.app/toss/push-status');
      if (!res.ok) continue;
      const json = await res.json();
      if (json.pushEnabled === false) {
        console.log('[pause-notify] verified pushEnabled=false');
        return;
      }
    } catch {
      // retry
    }
  }
  console.warn('[pause-notify] deploy done but pushEnabled verification timed out');
}

async function main() {
  console.log('[pause-notify] pausing server push delivery…');

  const qstash = run('npm', ['run', 'qstash:pause', '--prefix', 'server'], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  });
  if (qstash.status !== 0) {
    console.warn('[pause-notify] qstash:pause failed — check server/.env QSTASH_TOKEN');
  }

  upsertEnv(ENV_KEY, ENV_VALUE);

  console.log('[pause-notify] deploying production…');
  vercel(['deploy', '--prod', '--yes']);

  await verifyPaused();
  console.log('[pause-notify] done — 토스 콘솔에서 기능성 캠페인 재생성 후 resume-notify-push 실행');
}

main().catch((e) => {
  console.error(`[pause-notify] ${e.message}`);
  process.exit(1);
});
