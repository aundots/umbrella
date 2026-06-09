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

function decodeBase64Pem(b64: string | undefined): string | null {
  if (!b64?.trim()) return null;
  try {
    return normalizePem(Buffer.from(b64.trim(), 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}

function readPem(pemEnv: string | undefined, b64Env: string | undefined, filePath: string | undefined): string | null {
  const fromB64 = decodeBase64Pem(b64Env);
  if (fromB64) return fromB64;
  if (pemEnv?.trim()) return normalizePem(pemEnv);
  if (filePath && existsSync(filePath)) {
    return normalizePem(readFileSync(filePath, 'utf-8'));
  }
  return null;
}

function readCertPem(): string | null {
  return readPem(
    process.env.MTLS_CERT_PEM,
    process.env.MTLS_CERT_PEM_B64,
    process.env.MTLS_CERT_PATH ?? DEFAULT_CERT,
  );
}

function readKeyPem(): string | null {
  return readPem(
    process.env.MTLS_KEY_PEM,
    process.env.MTLS_KEY_PEM_B64,
    process.env.MTLS_KEY_PATH ?? DEFAULT_KEY,
  );
}

function validatePair(cert: string, key: string): { ok: true } | { ok: false; error: string } {
  try {
    createSecureContext({ cert, key });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'invalid pem pair' };
  }
}

export interface MtlsDiagnostics {
  configured: boolean;
  cert: {
    source: 'b64' | 'pem' | 'file' | 'missing';
    length: number;
    hasBeginLine: boolean;
  };
  key: {
    source: 'b64' | 'pem' | 'file' | 'missing';
    length: number;
    hasBeginLine: boolean;
  };
  pairError: string | null;
  hint: string | null;
}

function pemSource(pemEnv?: string, b64Env?: string, filePath?: string): MtlsDiagnostics['cert']['source'] {
  if (b64Env?.trim()) return 'b64';
  if (pemEnv?.trim()) return 'pem';
  if (filePath && existsSync(filePath)) return 'file';
  return 'missing';
}

export function getMtlsDiagnostics(): MtlsDiagnostics {
  const certRaw =
    process.env.MTLS_CERT_PEM_B64?.trim()
      ? decodeBase64Pem(process.env.MTLS_CERT_PEM_B64)
      : process.env.MTLS_CERT_PEM?.trim()
        ? normalizePem(process.env.MTLS_CERT_PEM)
        : null;
  const keyRaw =
    process.env.MTLS_KEY_PEM_B64?.trim()
      ? decodeBase64Pem(process.env.MTLS_KEY_PEM_B64)
      : process.env.MTLS_KEY_PEM?.trim()
        ? normalizePem(process.env.MTLS_KEY_PEM)
        : null;

  const cert = readCertPem();
  const key = readKeyPem();

  let pairError: string | null = null;
  if (cert && key) {
    const v = validatePair(cert, key);
    if (!v.ok) pairError = v.error;
  } else if (!cert && !key) {
    pairError = 'cert and key missing';
  } else if (!cert) {
    pairError = 'cert missing or invalid';
  } else {
    pairError = 'key missing or invalid';
  }

  const configured = cert != null && key != null && pairError == null;

  let hint: string | null = null;
  if (!configured) {
    if (process.env.MTLS_CERT_PEM?.trim() && !certRaw?.includes('BEGIN')) {
      hint = 'MTLS_CERT_PEM value does not contain -----BEGIN CERTIFICATE-----. Re-paste the full .crt file.';
    } else if (process.env.MTLS_KEY_PEM?.trim() && !keyRaw?.includes('BEGIN')) {
      hint = 'MTLS_KEY_PEM value does not contain -----BEGIN PRIVATE KEY-----. Re-paste the full .key file.';
    } else if (pairError?.includes('no start line')) {
      hint = 'PEM newlines are broken. Delete MTLS_* env vars and use MTLS_CERT_PEM_B64 + MTLS_KEY_PEM_B64 (single-line base64).';
    } else if (pairError?.includes('key values mismatch')) {
      hint = 'Cert and key do not match. Ensure public.crt → cert and private.key → key (not swapped).';
    } else {
      hint = 'Set MTLS_CERT_PEM_B64 and MTLS_KEY_PEM_B64 with base64-encoded PEM files, then redeploy.';
    }
  }

  return {
    configured,
    cert: {
      source: pemSource(
        process.env.MTLS_CERT_PEM,
        process.env.MTLS_CERT_PEM_B64,
        process.env.MTLS_CERT_PATH ?? DEFAULT_CERT,
      ),
      length: cert?.length ?? process.env.MTLS_CERT_PEM?.length ?? 0,
      hasBeginLine: Boolean(cert?.includes('BEGIN CERTIFICATE')),
    },
    key: {
      source: pemSource(
        process.env.MTLS_KEY_PEM,
        process.env.MTLS_KEY_PEM_B64,
        process.env.MTLS_KEY_PATH ?? DEFAULT_KEY,
      ),
      length: key?.length ?? process.env.MTLS_KEY_PEM?.length ?? 0,
      hasBeginLine: Boolean(key?.includes('BEGIN PRIVATE KEY') || key?.includes('BEGIN RSA PRIVATE KEY')),
    },
    pairError: configured ? null : pairError,
    hint,
  };
}

export function getMtlsMaterial(): { cert: string; key: string } | null {
  const cert = readCertPem();
  const key = readKeyPem();
  if (!cert || !key) return null;
  const v = validatePair(cert, key);
  if (!v.ok) return null;
  return { cert, key };
}

export function isMtlsConfigured(): boolean {
  return getMtlsMaterial() != null;
}

export function createMtlsAgent(): https.Agent {
  const material = getMtlsMaterial();
  if (!material) {
    const d = getMtlsDiagnostics();
    throw new Error(d.hint ?? d.pairError ?? 'mTLS certificate is not configured');
  }
  return new https.Agent({
    cert: material.cert,
    key: material.key,
    rejectUnauthorized: true,
  });
}
