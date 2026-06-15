import { Storage } from '@apps-in-toss/framework';

export const NOTIFY_ENABLED_KEY = 'umbrella-notify-enabled';
export const NOTIFY_BEFORE_MIN_KEY = 'umbrella-notify-before-min';

export async function getNotifyEnabled(): Promise<boolean> {
  try {
    return (await Storage.getItem(NOTIFY_ENABLED_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function setNotifyEnabled(enabled: boolean): Promise<void> {
  if (enabled) {
    await Storage.setItem(NOTIFY_ENABLED_KEY, 'true');
  } else {
    await Storage.removeItem(NOTIFY_ENABLED_KEY);
  }
}

export async function getNotifyBeforeMin(): Promise<30 | 60> {
  try {
    const v = await Storage.getItem(NOTIFY_BEFORE_MIN_KEY);
    return v === '60' ? 60 : 30;
  } catch {
    return 30;
  }
}

export async function setNotifyBeforeMin(minutes: 30 | 60): Promise<void> {
  await Storage.setItem(NOTIFY_BEFORE_MIN_KEY, String(minutes));
}
