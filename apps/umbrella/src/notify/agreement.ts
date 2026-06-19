import {
  isMinVersionSupported,
  requestNotificationAgreement,
} from '@apps-in-toss/framework';
import { fetchNotifyConfig } from '../services/api';
import { NOTIFICATION_AGREEMENT_TEMPLATE_CODE } from '../config';

const AGREEMENT_MIN_VERSION = { android: '5.255.0', ios: '5.255.0' } as const;
const FALLBACK_TEMPLATE_CODES = [NOTIFICATION_AGREEMENT_TEMPLATE_CODE, 'umbrella-_rain_alert', 'umbrella_rain_alert'] as const;

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

function consoleChecklist(deploymentId: string | null): string {
  const idLine = deploymentId
    ? `3. 앱 출시 → deploymentId ${deploymentId} 선택 → QR로 앱 다시 열기`
    : '3. 앱 출시 → 최신 .ait 선택 → QR로 앱 다시 열기';
  return [
    '토스 콘솔 확인:',
    '1. 스마트 발송 → 기능성 캠페인 umbrella_rain_alert 검수 승인',
    '2. 알림동의문 등록 + 캠페인에 연결·승인',
    idLine,
  ].join('\n');
}

let activeCleanup: (() => void) | null = null;
let agreementGeneration = 0;

export type AgreementOutcome = 'agreed' | 'rejected' | 'unsupported' | 'error';

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
  let templateCodes = [...FALLBACK_TEMPLATE_CODES];
  try {
    const cfg = await fetchNotifyConfig();
    deploymentId = cfg.deploymentId;
    templateCodes = uniqueCodes([
      cfg.pushTemplateCode,
      cfg.agreementTemplateCode,
      ...FALLBACK_TEMPLATE_CODES,
    ]);
  } catch {
    templateCodes = uniqueCodes([...FALLBACK_TEMPLATE_CODES]);
  }

  const finish = (outcome: AgreementOutcome, detail?: string) => {
    if (generation !== agreementGeneration) return;
    onResult(outcome, detail);
    activeCleanup?.();
    activeCleanup = null;
  };

  const tried: string[] = [];

  const tryCode = (index: number): void => {
    if (generation !== agreementGeneration) return;
    const templateCode = templateCodes[index];
    if (!templateCode) {
      finish(
        'error',
        deploymentId
          ? `동의 코드를 찾지 못했어요. 콘솔에 최신 .ait(deploymentId ${deploymentId})를 업로드했는지 확인해 주세요.`
          : '동의 코드를 찾지 못했어요.',
      );
      return;
    }

    tried.push(templateCode);
    activeCleanup = requestNotificationAgreement({
      options: { templateCode },
      onEvent: ({ type }) => {
        if (type === 'newAgreement' || type === 'alreadyAgreed') {
          finish('agreed');
        } else if (type === 'agreementRejected') {
          finish('rejected');
        } else {
          finish('rejected');
        }
      },
      onError: (error) => {
        const msg = errorMessage(error);
        console.warn(`[notify agreement] code=${templateCode}`, error);
        if (msg.includes('취소')) {
          finish('rejected');
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
          `${msg || '알림 동의에 실패하였습니다.'} (코드: ${tried.join(' → ')})\n\n${consoleChecklist(deploymentId)}`,
        );
      },
    });
  };

  tryCode(0);
}
