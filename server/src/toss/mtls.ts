import { existsSync, readFileSync } from 'fs';
import https from 'https';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CERT = join(__dir, '../../mtls/weather_public.crt');
const DEFAULT_KEY = join(__dir, '../../mtls/weather_private.key');

function readPem(envValue: string | undefined, filePath: string | undefined): string | null {
  if (envValue?.trim()) return envValue.trim();
  if (filePath && existsSync(filePath)) {
    return readFileSync(filePath, 'utf-8');
  }
  return null;
}

export function getMtlsMaterial(): { cert: string; key: string } | null {
  const cert = readPem(process.env.MTLS_CERT_PEM, process.env.MTLS_CERT_PATH ?? DEFAULT_CERT);
  const key = readPem(process.env.MTLS_KEY_PEM, process.env.MTLS_KEY_PATH ?? DEFAULT_KEY);
  if (!cert || !key) return null;
  return { cert, key };
}

export function isMtlsConfigured(): boolean {
  return getMtlsMaterial() != null;
}

export function createMtlsAgent(): https.Agent {
  const material = getMtlsMaterial();
  if (!material) {
    throw new Error('mTLS certificate is not configured');
  }
  return new https.Agent({
    cert: material.cert,
    key: material.key,
    rejectUnauthorized: true,
  });
}
