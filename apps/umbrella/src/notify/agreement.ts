import {
  isMinVersionSupported,
  requestNotificationAgreement,
} from '@apps-in-toss/framework';
import { fetchNotifyConfig } from '../services/api';
import { NOTIFICATION_AGREEMENT_TEMPLATE_CODE } from '../config';

const AGREEMENT_MIN_VERSION = { android: '5.255.0', ios: '5.255.0' } as const;

function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>;
    if (typeof e.message === 'string' && e.message.trim()) return e.message;
    if (typeof e.reason === 'string' && e.reason.trim()) return e.reason;
    try {
      return JSON.stringify(error);
    } catch {
      return '';
    }
  }
  return '';
}

function consoleChecklist(deploymentId: string | null, templateCode: string): string {
  const idLine = deploymentId
    ? `3. 앱 출시 → deploymentId ${deploymentId} 선택 → QR로 앱 다시 열기`
    : '3. 앱 출시 → 최신 .ait 선택 → QR로 앱 다시 열기';
  return [
    '토스 콘솔 확인:',
    `1. 기능성 캠페인 발송 코드 ${templateCode} 검수 승인`,
    '2. 알림 동의문(2260)이 위 캠페인에 연결·승인',
    idLine,
  ].join('\n');
}

let activeCleanup: (() => void) | null = null;
let agreementGeneration = 0;

export type AgreementOutcome =
  | 'agreed'
  | 'alreadyAgreed'
  | 'rejected'
  | 'unsupported'
  | 'error';

function uniqueCodes(codes: string[]): string[] {
  return [...new Set(codes.map((c) => c.trim()).filter(Boolean))];
}

export async function requestRainNotificationAgreement(
  onResult: (outcome: AgreementOutcome, detail?: string) => void,
): Promise<void> {
  const generation = ++agreementGeneration;
  activeCleanup?.();
  activeCleanup = null;

  if (typeof requestNotificationAgreement !== 'function') {
    onResult('unsupported');
    return;
  }

  if (!isMinVersionSupported(AGREEMENT_MIN_VERSION)) {
    onResult('unsupported');
    return;
  }

  let deploymentId: string | null = null;
  let templateCodes = [NOTIFICATION_AGREEMENT_TEMPLATE_CODE, 'umbrella-_rain_alert'];

  try {
    const cfg = await fetchNotifyConfig();
    deploymentId = cfg.deploymentId;
    templateCodes = uniqueCodes([
      cfg.agreementTemplateCode ?? '',
      cfg.pushTemplateCode ?? '',
      NOTIFICATION_AGREEMENT_TEMPLATE_CODE,
      'umbrella-_rain_alert',
    ]);
  } catch {
    templateCodes = uniqueCodes(templateCodes);
  }

  if (templateCodes.length === 0) {
    onResult('error', '알림 템플릿 코드를 불러오지 못했어요.');
    return;
  }

  const tried: string[] = [];
  let settled = false;

  const finish = (outcome: AgreementOutcome, detail?: string) => {
    if (generation !== agreementGeneration || settled) return;
    settled = true;
    onResult(outcome, detail);
    activeCleanup?.();
    activeCleanup = null;
  };

  const tryCode = (index: number): void => {
    if (generation !== agreementGeneration || settled) return;
    const templateCode = templateCodes[index];
    if (!templateCode) {
      finish('error', '동의 코드를 찾지 못했어요.');
      return;
    }

    tried.push(templateCode);
    activeCleanup = requestNotificationAgreement({
      options: { templateCode },
      onEvent: ({ type }) => {
        if (type === 'newAgreement') {
          finish('agreed');
        } else if (type === 'alreadyAgreed') {
          finish('alreadyAgreed');
        } else if (type === 'agreementRejected') {
          finish('rejected');
        } else {
          finish('rejected');
        }
      },
      onError: (error) => {
        if (settled) return;
        const msg = errorMessage(error);
        console.warn(`[notify agreement] code=${templateCode}`, error);
        if (msg.includes('취소')) {
          finish('rejected');
          return;
        }
        if (/already|이미\s*동의/i.test(msg)) {
          finish('alreadyAgreed');
          return;
        }
        if (index + 1 < templateCodes.length) {
          activeCleanup?.();
          activeCleanup = null;
          tryCode(index + 1);
          return;
        }
        finish(
          'error',
          `${msg || '알림 동의에 실패하였습니다.'} (코드: ${tried.join(' → ')})\n\n${consoleChecklist(deploymentId, templateCode)}`,
        );
      },
    });
  };

  tryCode(0);
}
