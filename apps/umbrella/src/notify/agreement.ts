import * as Framework from '@apps-in-toss/framework';
import { NOTIFICATION_AGREEMENT_TEMPLATE_CODE } from '../config';

type NotificationAgreementResult = 'newAgreement' | 'alreadyAgreed' | 'agreementRejected';

type RequestFn = (params: {
  options: { templateCode: string };
  onEvent: (result: { type: NotificationAgreementResult }) => void;
  onError: (error: unknown) => void | Promise<void>;
}) => () => void;

let activeCleanup: (() => void) | null = null;

export type AgreementOutcome = 'agreed' | 'rejected' | 'unsupported' | 'error';

function getRequestFn(): RequestFn | null {
  const fn = (Framework as { requestNotificationAgreement?: RequestFn }).requestNotificationAgreement;
  return typeof fn === 'function' ? fn : null;
}

export function requestRainNotificationAgreement(
  onResult: (outcome: AgreementOutcome) => void,
): void {
  activeCleanup?.();
  activeCleanup = null;

  const requestNotificationAgreement = getRequestFn();
  if (!requestNotificationAgreement) {
    onResult('unsupported');
    return;
  }

  activeCleanup = requestNotificationAgreement({
    options: { templateCode: NOTIFICATION_AGREEMENT_TEMPLATE_CODE },
    onEvent: ({ type }) => {
      if (type === 'newAgreement' || type === 'alreadyAgreed') {
        onResult('agreed');
      } else {
        onResult('rejected');
      }
      activeCleanup?.();
      activeCleanup = null;
    },
    onError: () => {
      onResult('error');
      activeCleanup?.();
      activeCleanup = null;
    },
  });
}
