import { tossApiRequest } from './client.js';

export interface SendMessageInput {
  userKey: string | number;
  templateSetCode: string;
  context: Record<string, string>;
}

export const DEFAULT_PUSH_CONTEXT: Record<string, string> = {
  location: '현재 위치',
  minutes: '30',
  status: 'approaching',
};

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
