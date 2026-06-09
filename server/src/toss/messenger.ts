import { tossApiRequest } from './client.js';

export interface SendMessageInput {
  userKey: string | number;
  templateSetCode: string;
  context: Record<string, string>;
}

/** 콘솔 내용: `{{ msg }} 비 와요.` — msg 뒤 고정 어미는 템플릿에 둠 */
export const PUSH_RAIN_SUFFIX = ' 비 와요.';
/** 콘솔 내용: `{{ msg }} 비 그쳤어요.` */
export const PUSH_CLEAR_SUFFIX = ' 비 그쳤어요.';

const RAIN_MSG_MAX = 25 - PUSH_RAIN_SUFFIX.length;
const CLEAR_MSG_MAX = 25 - PUSH_CLEAR_SUFFIX.length;

/** @deprecated PUSH_RAIN_SUFFIX */
export const PUSH_BODY_SUFFIX = PUSH_RAIN_SUFFIX;

/** Toss 콘솔 템플릿 변수 msg 기본값 (강수 예고 테스트) */
export const DEFAULT_PUSH_CONTEXT: Record<string, string> = {
  msg: '30분 후 집에',
};

/** 강수 종료 테스트 */
export const DEFAULT_PUSH_CLEAR_CONTEXT: Record<string, string> = {
  msg: '지금 집에',
};

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

/** 푸시 본문 — `{{ msg }} 비 와요.` 에 들어갈 앞부분 */
export function buildPushMsg(
  locName: string,
  report: {
    relayStatus: string;
    now: { precipitating: boolean };
    arrival: { inMinutes: number | null };
  },
): string {
  const place = truncate(locName.trim() || '현재 위치', 8);

  if (report.now.precipitating || report.relayStatus === 'live') {
    return truncate(`지금 ${place}에`, RAIN_MSG_MAX);
  }

  const minutes = report.arrival.inMinutes;
  if (minutes != null && minutes > 0) {
    return truncate(`${minutes}분 후 ${place}에`, RAIN_MSG_MAX);
  }

  return truncate(`${place}에`, RAIN_MSG_MAX);
}

/** 푸시 본문 — `{{ msg }} 비 그쳤어요.` 에 들어갈 앞부분 */
export function buildPushMsgClear(locName: string): string {
  const place = truncate(locName.trim() || '현재 위치', 8);
  return truncate(`지금 ${place}에`, CLEAR_MSG_MAX);
}

/** @deprecated buildPushMsg 사용 */
export const buildPushName = buildPushMsg;

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
