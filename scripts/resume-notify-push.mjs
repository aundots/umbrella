#!/usr/bin/env node
/**
 * 기능성 캠페인 검수 승인 + Vercel 템플릿 코드 갱신 후 알림 발송 재개
 * - NOTIFY_PUSH_ENABLED=true
 * - QStash 스케줄 재생성
 * - production 재배포
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_KEY = 'NOTIFY_PUSH_ENABLED';
const ENV_VALUE = 'true';

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
    // empty
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
    console.log(`[resume-notify] ${key}=${value} (${target})`);
  }
}

async function main() {
  console.log('[resume-notify] resuming server push delivery…');

  upsertEnv(ENV_KEY, ENV_VALUE);

  const qstash = run('npm', ['run', 'qstash:setup', '--prefix', 'server'], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  });
  if (qstash.status !== 0) {
    throw new Error('qstash:setup failed');
  }

  console.log('[resume-notify] deploying production…');
  vercel(['deploy', '--prod', '--yes']);
  console.log('[resume-notify] done');
}

main().catch((e) => {
  console.error(`[resume-notify] ${e.message}`);
  process.exit(1);
});
