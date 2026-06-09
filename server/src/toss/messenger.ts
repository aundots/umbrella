import { tossApiRequest } from './client.js';

export interface SendMessageInput {
  userKey: string | number;
  templateSetCode: string;
  context: Record<string, string>;
}

/** Toss 콘솔 템플릿 변수가 name 하나만 있을 때 기본값 */
export const DEFAULT_PUSH_CONTEXT: Record<string, string> = {
  name: '30분 후 비 예정',
};

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

/** 푸시 본문 25자 제한 — name 변수에 들어갈 한 줄 문구 */
export function buildPushName(
  locName: string,
  report: {
    relayStatus: string;
    now: { precipitating: boolean };
    arrival: { inMinutes: number | null };
  },
): string {
  const place = truncate(locName.trim() || '현재 위치', 8);

  if (report.now.precipitating || report.relayStatus === 'live') {
    return truncate(`${place} 비 내리는 중`, 24);
  }

  const minutes = report.arrival.inMinutes;
  if (minutes != null && minutes > 0) {
    return truncate(`${minutes}분 후 ${place} 비`, 24);
  }

  return truncate(`${place} 강수 알림`, 24);
}

export async function sendFunctionalMessage(input: SendMessageInput) {
  return tossApiRequest<unknown>('/api-partner/v1/apps-in-toss/messenger/send-message', {
    method: 'POST',
    headers: {
      'x-toss-user-key': String(input.userKey),
    },
    body: {
      templateSetCode: input.templateSetCode,
      context: input.context,
    },
  });
}

export async function sendTestFunctionalMessage(
  input: SendMessageInput & { deploymentId?: string },
) {
  const deploymentId = input.deploymentId ?? process.env.TOSS_DEPLOYMENT_ID?.trim();
  if (!deploymentId) {
    throw new Error('TOSS_DEPLOYMENT_ID is required for test push');
  }

  return tossApiRequest<unknown>('/api-partner/v1/apps-in-toss/messenger/send-test-message', {
    method: 'POST',
    headers: {
      'x-toss-user-key': String(input.userKey),
    },
    body: {
      templateSetCode: input.templateSetCode,
      deploymentId,
      context: input.context,
    },
  });
}
