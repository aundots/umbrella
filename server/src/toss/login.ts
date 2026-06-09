import { tossApiRequest } from './client.js';

const AUTH_BASE = '/api-partner/v1/apps-in-toss/user/oauth2';

export interface TokenSuccess {
  accessToken: string;
  refreshToken: string;
  tokenType?: string;
  expiresIn?: string | number;
  scope?: string;
}

export interface LoginMeSuccess {
  userKey: number;
  scope?: string;
  agreedTerms?: string[];
}

export async function generateTossToken(input: {
  authorizationCode: string;
  referrer: string;
}) {
  return tossApiRequest<TokenSuccess>(`${AUTH_BASE}/generate-token`, {
    method: 'POST',
    body: input,
  });
}

export async function refreshTossToken(refreshToken: string) {
  return tossApiRequest<TokenSuccess>(`${AUTH_BASE}/refresh-token`, {
    method: 'POST',
    body: { refreshToken },
  });
}

export async function getLoginMe(accessToken: string) {
  return tossApiRequest<LoginMeSuccess>(`${AUTH_BASE}/login-me`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function removeAccessByToken(accessToken: string) {
  return tossApiRequest<unknown>(`${AUTH_BASE}/access/remove-by-access-token`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: {},
  });
}

export async function removeAccessByUserKey(userKey: string | number) {
  return tossApiRequest<{ userKey: number }>(`${AUTH_BASE}/access/remove-by-user-key`, {
    method: 'POST',
    body: { userKey: Number(userKey) },
  });
}

export async function exchangeAuthorizationCode(input: {
  authorizationCode: string;
  referrer: string;
}) {
  const tokenRes = await generateTossToken(input);
  if (tokenRes.data.resultType !== 'SUCCESS' || !tokenRes.data.success?.accessToken) {
    return { tokenRes, meRes: null as null, userKey: null as null };
  }

  const accessToken = tokenRes.data.success.accessToken;
  const meRes = await getLoginMe(accessToken);
  const userKey =
    meRes.data.resultType === 'SUCCESS' && meRes.data.success?.userKey != null
      ? String(meRes.data.success.userKey)
      : null;

  return { tokenRes, meRes, userKey, accessToken };
}
