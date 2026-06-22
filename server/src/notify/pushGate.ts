/** 토스 콘솔에서 기능성 캠페인 수정·재생성 시 서버 발송 일시 중단용 */
export function isNotifyPushEnabled(): boolean {
  const v = process.env.NOTIFY_PUSH_ENABLED?.trim().toLowerCase();
  if (!v || v === 'true' || v === '1' || v === 'on' || v === 'yes') return true;
  return false;
}

export const NOTIFY_PUSH_PAUSED_REASON =
  '알림 발송이 일시 중단되었습니다. 토스 콘솔에서 기능성 캠페인 재생성·검수 후 다시 켜 주세요.';
