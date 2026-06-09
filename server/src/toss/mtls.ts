import { existsSync, readFileSync } from 'fs';
import https from 'https';
import { dirname, join } from 'path';
import { createSecureContext } from 'tls';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CERT = join(__dir, '../../mtls/weather_public.crt');
const DEFAULT_KEY = join(__dir, '../../mtls/weather_private.key');

/** Vercel env often stores PEM as one line or with literal \\n — normalize for OpenSSL. */
export function normalizePem(raw: string): string {
  let s = raw.trim();

  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }

  s = s.replace(/\\n/g, '\n');
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const begin = s.match(/-----BEGIN [^-]+-----/);
  const end = s.match(/-----END [^-]+-----/);
  if (begin && end) {
    const start = s.indexOf(begin[0]);
    const endIdx = s.indexOf(end[0]);
    if (start >= 0 && endIdx > start) {
      const header = begin[0];
      const footer = end[0];
      const body = s.slice(start + header.length, endIdx).replace(/\s+/g, '');
      s = `${header}\n${body.replace(/(.{64})/g, '$1\n').trim()}\n${footer}`;
    }
  }

  s = s
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');

  return s.endsWith('\n') ? s : `${s}\n`;
}

function readPem(envValue: string | undefined, filePath: string | undefined): string | null {
  if (envValue?.trim()) return normalizePem(envValue);
  if (filePath && existsSync(filePath)) {
    return normalizePem(readFileSync(filePath, 'utf-8'));
  }
  return null;
}

function isValidPemPair(cert: string, key: string): boolean {
  try {
    createSecureContext({ cert, key });
    return true;
  } catch {
    return false;
  }
}

export function getMtlsMaterial(): { cert: string; key: string } | null {
  const cert = readPem(process.env.MTLS_CERT_PEM, process.env.MTLS_CERT_PATH ?? DEFAULT_CERT);
  const key = readPem(process.env.MTLS_KEY_PEM, process.env.MTLS_KEY_PATH ?? DEFAULT_KEY);
  if (!cert || !key) return null;
  if (!isValidPemPair(cert, key)) return null;
  return { cert, key };
}

export function isMtlsConfigured(): boolean {
  return getMtlsMaterial() != null;
}

export function createMtlsAgent(): https.Agent {
  const material = getMtlsMaterial();
  if (!material) {
    throw new Error('mTLS certificate is not configured or PEM is invalid');
  }
  return new https.Agent({
    cert: material.cert,
    key: material.key,
    rejectUnauthorized: true,
  });
}
