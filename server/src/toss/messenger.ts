import { tossApiRequest } from './client.js';

export interface SendMessageInput {
  userKey: string | number;
  templateSetCode: string;
  context: Record<string, string>;
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

export async function sendTestFunctionalMessage(input: Omit<SendMessageInput, 'userKey'>) {
  return tossApiRequest<unknown>('/api-partner/v1/apps-in-toss/messenger/send-test-message', {
    method: 'POST',
    body: {
      templateSetCode: input.templateSetCode,
      context: input.context,
    },
  });
}
