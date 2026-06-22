import { tossApiRequest, type TossApiResponse } from './client.js';

export interface SendMessageInput {
  userKey: string | number;
  templateSetCode: string;
  context: Record<string, string>;
}

/** 콘솔 내용: `{{ msg }} 비 와요.` — msg 뒤 고정 어미는 템플릿에 둠 */
export const PUSH_RAIN_SUFFIX = ' 비 와요.';
/** 콘솔 내용: `{{ msg }} 비 그쳤어요.` */
export const PUSH_CLEAR_SUFFIX = ' 비 그쳤어요.';
/** 콘솔 내용: `{{ msg }} 비 곧 그쳐요.` */
export const PUSH_END_SOON_SUFFIX = ' 비 곧 그쳐요.';
/** 콘솔 내용: `{{ msg }} 비 예보 취소됐어요.` */
export const PUSH_CANCEL_SUFFIX = ' 비 예보 취소됐어요.';

const RAIN_MSG_MAX = 25 - PUSH_RAIN_SUFFIX.length;
const CLEAR_MSG_MAX = 25 - PUSH_CLEAR_SUFFIX.length;
const END_SOON_MSG_MAX = 25 - PUSH_END_SOON_SUFFIX.length;
const CANCEL_MSG_MAX = 25 - PUSH_CANCEL_SUFFIX.length;

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

/** 강수 곧 종료 테스트 */
export const DEFAULT_PUSH_END_SOON_CONTEXT: Record<string, string> = {
  msg: '30분 후 집에',
};

/** 예보 취소 테스트 */
export const DEFAULT_PUSH_CANCEL_CONTEXT: Record<string, string> = {
  msg: '양재',
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

/** 푸시 본문 — `{{ msg }} 비 곧 그쳐요.` 에 들어갈 앞부분 */
export function buildPushMsgEndSoon(locName: string, remainingMinutes: number): string {
  const place = truncate(locName.trim() || '현재 위치', 8);
  const mins = Math.max(1, Math.min(60, Math.round(remainingMinutes)));
  return truncate(`${mins}분 후 ${place}에`, END_SOON_MSG_MAX);
}

/** 푸시 본문 — `{{ msg }} 비 예보 취소됐어요.` 에 들어갈 앞부분 */
export function buildPushMsgCancel(locName: string): string {
  const place = truncate(locName.trim() || '현재 위치', 10);
  return truncate(place, CANCEL_MSG_MAX);
}

/** @deprecated buildPushMsg 사용 */
export const buildPushName = buildPushMsg;

export interface MessengerSendSuccess {
  msgCount?: number;
  sentPushCount?: number;
  sentInboxCount?: number;
  fail?: {
    sentPush?: Array<{ reachedFailReason?: string }>;
    sentInbox?: Array<{ reachedFailReason?: string }>;
  };
}

export interface SendDeliveryResult {
  /** API 호출 자체 성공 (resultType SUCCESS) */
  accepted: boolean;
  /** 푸시/알림함 중 1건 이상 도달 */
  delivered: boolean;
  sentPushCount: number;
  sentInboxCount: number;
  failReasons: string[];
}

export function parseSendDelivery(data: TossApiResponse<MessengerSendSuccess>): SendDeliveryResult {
  const success = data.success;
  const sentPushCount = success?.sentPushCount ?? 0;
  const sentInboxCount = success?.sentInboxCount ?? 0;
  const failReasons: string[] = [];
  for (const item of success?.fail?.sentPush ?? []) {
    if (item.reachedFailReason) failReasons.push(item.reachedFailReason);
  }
  for (const item of success?.fail?.sentInbox ?? []) {
    if (item.reachedFailReason) failReasons.push(item.reachedFailReason);
  }
  return {
    accepted: data.resultType === 'SUCCESS',
    delivered: sentPushCount > 0 || sentInboxCount > 0,
    sentPushCount,
    sentInboxCount,
    failReasons: [...new Set(failReasons)],
  };
}

export function formatDeliveryError(delivery: SendDeliveryResult): string | undefined {
  if (delivery.delivered) return undefined;
  if (delivery.failReasons.includes('TERMS_DISAGREED_MEMBER')) {
    return (
      '토스 알림 약관 미동의입니다. (대부분 "사용자 최적화 동의" 꺼짐)\n' +
      '① 토스 앱 → 전체 → 상단 검색 → "사용자 최적화 동의" → 동의\n' +
      '② 우산챙겨 설정 → 강수 알림 켜서 동의하기\n' +
      '③ 토스 앱 → 설정 → 알림 → 서비스별 알림 → 우산챙겨 ON'
    );
  }
  if (delivery.failReasons.length > 0) {
    return `발송 실패: ${delivery.failReasons.join(', ')}`;
  }
  if (delivery.accepted) {
    return 'API는 성공했지만 푸시가 0건입니다. 콘솔에서 캠페인 검수 승인을 확인해 주세요.';
  }
  return undefined;
}

export async function sendFunctionalMessage(input: SendMessageInput) {
  return tossApiRequest<MessengerSendSuccess>('/api-partner/v1/apps-in-toss/messenger/send-message', {
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

  return tossApiRequest<MessengerSendSuccess>('/api-partner/v1/apps-in-toss/messenger/send-test-message', {
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
