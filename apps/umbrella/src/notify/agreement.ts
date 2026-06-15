import {
  isMinVersionSupported,
  requestNotificationAgreement,
} from '@apps-in-toss/framework';
import { NOTIFICATION_AGREEMENT_TEMPLATE_CODE } from '../config';

const AGREEMENT_MIN_VERSION = { android: '5.255.0', ios: '5.255.0' } as const;

let activeCleanup: (() => void) | null = null;
let agreementGeneration = 0;

export type AgreementOutcome = 'agreed' | 'rejected' | 'unsupported' | 'error';

function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return '';
}

export function requestRainNotificationAgreement(
  onResult: (outcome: AgreementOutcome, detail?: string) => void,
): void {
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

  const finish = (outcome: AgreementOutcome, detail?: string) => {
    if (generation !== agreementGeneration) return;
    onResult(outcome, detail);
    activeCleanup?.();
    activeCleanup = null;
  };

  activeCleanup = requestNotificationAgreement({
    options: { templateCode: NOTIFICATION_AGREEMENT_TEMPLATE_CODE },
    onEvent: ({ type }) => {
      if (type === 'newAgreement' || type === 'alreadyAgreed') {
        finish('agreed');
      } else {
        finish('rejected');
      }
    },
    onError: (error) => {
      const msg = errorMessage(error);
      console.warn('[notify agreement]', error);
      if (msg.includes('취소')) {
        finish('rejected');
        return;
      }
      finish('error', msg || undefined);
    },
  });
}
