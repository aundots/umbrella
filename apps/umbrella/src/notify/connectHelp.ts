/**
 * 기능성 메시지 도달에 필요한 3개 권한 레이어 (토스 공식 커뮤니티 확인)
 * 1) 사용자 최적화 제품 동의 (토스 계정) — 미동의 시 TERMS_DISAGREED_MEMBER
 * 2) 미니앱 알림 동의 (requestNotificationAgreement)
 * 3) OS / 서비스별 알림 ON
 */
export const NOTIFY_PERMISSION_STEPS =
  '① 사용자 최적화 동의 — 토스 앱 [전체 → 상단 검색 → "사용자 최적화 동의"]에서 동의\n' +
  '② 강수 알림 동의 — 우산챙겨 설정에서 강수 알림 켜고 동의\n' +
  '③ 알림 허용 — 토스 앱 설정 → 알림 → 서비스별 알림 → 우산챙겨 ON';

/** @deprecated NOTIFY_PERMISSION_STEPS 사용 */
export const REVOKE_TOSS_NOTIFY_STEPS = NOTIFY_PERMISSION_STEPS;

export function isTermsDisagreedError(message: string): boolean {
  return /TERMS_DISAGREED|약관\s*미동의|최적화/i.test(message);
}

export function formatNotifyConnectError(message: string): string {
  if (isTermsDisagreedError(message)) {
    return (
      '토스 알림 약관이 연결되지 않았어요.\n' +
      '대부분 "사용자 최적화 동의"가 꺼져 있어서예요.\n\n' +
      NOTIFY_PERMISSION_STEPS
    );
  }
  if (/notify_push_paused|일시\s*중단/i.test(message)) {
    return '서버 알림 발송이 잠시 중단된 상태예요. 잠시 후 다시 시도해 주세요.';
  }
  return message;
}
