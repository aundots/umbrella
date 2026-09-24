import https from 'https';
import { createMtlsAgent, isMtlsConfigured } from './mtls.js';

const DEFAULT_BASE = 'https://apps-in-toss-api.toss.im';

export interface TossApiResponse<T = unknown> {
  resultType: 'SUCCESS' | 'FAIL';
  success?: T;
  error?: { errorCode?: string; reason?: string };
}

function getBaseUrl(): string {
  return process.env.TOSS_API_BASE_URL?.replace(/\/$/, '') ?? DEFAULT_BASE;
}

export async function tossApiRequest<T>(
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {},
): Promise<{ status: number; data: TossApiResponse<T> }> {
  if (!isMtlsConfigured()) {
    throw new Error('mTLS certificate is not configured');
  }

  const agent = createMtlsAgent();
  const url = new URL(path, `${getBaseUrl()}/`);
  const method = options.method ?? 'GET';
  const body = options.body != null ? JSON.stringify(options.body) : undefined;

  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method,
        agent,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers ?? {}),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          try {
            const data = raw ? (JSON.parse(raw) as TossApiResponse<T>) : ({} as TossApiResponse<T>);
            resolve({ status: res.statusCode ?? 500, data });
          } catch {
            reject(new Error(`Invalid Toss API response (${res.statusCode}): ${raw.slice(0, 200)}`));
          }
        });
      },
    );

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
