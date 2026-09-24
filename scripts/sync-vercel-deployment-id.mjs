#!/usr/bin/env node
/**
 * umbrella.ait 의 deploymentId → Vercel TOSS_DEPLOYMENT_ID 동기화 + production 재배포
 * npm run build --prefix apps/umbrella 후 자동 실행
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const aitPath = path.join(repoRoot, 'umbrella.ait');
const require = createRequire(
  path.join(repoRoot, 'apps', 'umbrella', 'package.json'),
);
const { AppsInTossBundle } = require('@apps-in-toss/ait-format');

const ENV_KEY = 'TOSS_DEPLOYMENT_ID';
const PROD_URL = 'https://umbrella-three-iota.vercel.app';

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['pipe', 'pipe', 'pipe'],
    ...opts,
  });
  return result;
}

function readDeploymentId() {
  if (!fs.existsSync(aitPath)) {
    console.error(`[sync-vercel] ${aitPath} not found — run ait build first`);
    process.exit(1);
  }
  const buffer = fs.readFileSync(aitPath);
  const format = AppsInTossBundle.detect(buffer);
  if (format !== AppsInTossBundle.Format.AIT) {
    console.error(`[sync-vercel] invalid .ait format: ${format}`);
    process.exit(1);
  }
  return AppsInTossBundle.reader(buffer).deploymentId;
}

function vercel(args, input) {
  const result = run('npx', ['--yes', 'vercel', ...args], {
    input: input ?? undefined,
  });
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || '').trim();
    throw new Error(err || `vercel ${args.join(' ')} failed`);
  }
  return (result.stdout || '').trim();
}

function envList() {
  try {
    return vercel(['env', 'ls']);
  } catch {
    return '';
  }
}

function envHasKey(listOutput, key) {
  return new RegExp(`\\b${key}\\b`).test(listOutput);
}

function removeEnv(key) {
  for (const target of ['production', 'preview', 'development']) {
    try {
      vercel(['env', 'rm', key, target, '--yes']);
      console.log(`[sync-vercel] removed ${key} (${target})`);
    } catch {
      // not set for this target
    }
  }
}

function addEnv(key, value) {
  for (const target of ['production', 'preview', 'development']) {
    vercel(['env', 'add', key, target], `${value}\n`);
    console.log(`[sync-vercel] set ${key} (${target})`);
  }
}

async function waitForHealth(expectedId, attempts = 12) {
  for (let i = 0; i < attempts; i += 1) {
    await new Promise((r) => setTimeout(r, 10_000));
    try {
      const res = await fetch(`${PROD_URL}/toss/push-status`);
      if (!res.ok) continue;
      const json = await res.json();
      if (json.deploymentId === expectedId) {
        console.log(`[sync-vercel] verified deploymentId on ${PROD_URL}`);
        return true;
      }
      console.log(
        `[sync-vercel] waiting… api=${json.deploymentId ?? 'null'} want=${expectedId}`,
      );
    } catch (e) {
      console.log(`[sync-vercel] health check retry: ${e.message}`);
    }
  }
  console.warn('[sync-vercel] deploy done but deploymentId verification timed out');
  return false;
}

async function main() {
  const deploymentId = readDeploymentId();
  console.log(`[sync-vercel] .ait deploymentId: ${deploymentId}`);

  const list = envList();
  if (envHasKey(list, ENV_KEY)) {
    const same = new RegExp(deploymentId).test(list);
    if (same) {
      console.log(`[sync-vercel] ${ENV_KEY} already matches — skip env update`);
    } else {
      removeEnv(ENV_KEY);
      addEnv(ENV_KEY, deploymentId);
    }
  } else {
    addEnv(ENV_KEY, deploymentId);
  }

  console.log('[sync-vercel] deploying production…');
  const deployOut = vercel(['deploy', '--prod', '--yes']);
  const urlMatch = deployOut.match(/https:\/\/[^\s]+\.vercel\.app/);
  if (urlMatch) {
    console.log(`[sync-vercel] deploy url: ${urlMatch[0]}`);
  }

  await waitForHealth(deploymentId);
  console.log('[sync-vercel] done');
}

main().catch((err) => {
  console.error(`[sync-vercel] ${err.message}`);
  process.exit(1);
});
