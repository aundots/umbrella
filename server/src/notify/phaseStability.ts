import type { RelayPhase, RelayPhaseEntry } from '../db/persistence.js';

/** approaching 등 일반 전이 안정 시간 (5분 크론 × 2회) */
export const PHASE_STABLE_MS = 10 * 60_000;

/** 비 그침(live→clear)은 더 길게 — 초단기 관측 공백으로 오경보 종료 방지 */
export const PHASE_CLEAR_STABLE_MS = 20 * 60_000;

/** 비 재개(clear→live)는 더 빠르게 — 실제 강수 복귀를 놓치지 않음 */
export const PHASE_RAIN_STABLE_MS = 5 * 60_000;

/** 비 옴/그침 알림은 서로 최소 이 간격 (왔다갔다 스팸 방지) */
export const OPPOSITE_NOTIFY_COOLDOWN_MS = 45 * 60_000;

function stableMsForTransition(confirmed: RelayPhase, pending: RelayPhase): number {
  if (confirmed === 'live' && pending === 'clear') return PHASE_CLEAR_STABLE_MS;
  if (confirmed === 'clear' && pending === 'live') return PHASE_RAIN_STABLE_MS;
  return PHASE_STABLE_MS;
}

export function normalizePhaseEntry(
  raw: RelayPhase | RelayPhaseEntry | undefined,
): RelayPhaseEntry {
  if (!raw) return { confirmed: 'clear' };
  if (typeof raw === 'string') return { confirmed: raw };
  return {
    confirmed: raw.confirmed ?? 'clear',
    pending: raw.pending,
    pendingSince: raw.pendingSince,
    lastRainNotifyAt: raw.lastRainNotifyAt,
    lastClearNotifyAt: raw.lastClearNotifyAt,
  };
}

export interface PhaseTransition {
  entry: RelayPhaseEntry;
  prevConfirmed: RelayPhase;
  confirmed: RelayPhase;
  /** 확정 상태가 이번 스캔에서 바뀌었는지 */
  transitioned: boolean;
  dirty: boolean;
}

/**
 * 관측값(raw)을 받아 확정 상태를 갱신한다.
 * 알림은 transitioned=true 일 때만 prev→confirmed 전이로 판단한다.
 */
export function advancePhaseEntry(
  raw: RelayPhaseEntry | RelayPhase | undefined,
  observed: RelayPhase,
): PhaseTransition {
  const entry = normalizePhaseEntry(raw);
  const prevConfirmed = entry.confirmed;
  let dirty = false;

  if (observed === entry.confirmed) {
    if (entry.pending != null) {
      entry.pending = undefined;
      entry.pendingSince = undefined;
      dirty = true;
    }
    return { entry, prevConfirmed, confirmed: entry.confirmed, transitioned: false, dirty };
  }

  if (observed !== entry.pending) {
    entry.pending = observed;
    entry.pendingSince = Date.now();
    dirty = true;
    return { entry, prevConfirmed, confirmed: entry.confirmed, transitioned: false, dirty };
  }

  const since = entry.pendingSince ?? Date.now();
  const stableMs = stableMsForTransition(entry.confirmed, observed);
  if (Date.now() - since < stableMs) {
    return { entry, prevConfirmed, confirmed: entry.confirmed, transitioned: false, dirty };
  }

  entry.confirmed = observed;
  entry.pending = undefined;
  entry.pendingSince = undefined;
  dirty = true;
  return {
    entry,
    prevConfirmed,
    confirmed: entry.confirmed,
    transitioned: true,
    dirty,
  };
}

export function canSendRainNotify(entry: RelayPhaseEntry): boolean {
  if (!entry.lastClearNotifyAt) return true;
  return Date.now() - entry.lastClearNotifyAt >= OPPOSITE_NOTIFY_COOLDOWN_MS;
}

export function canSendClearNotify(entry: RelayPhaseEntry): boolean {
  if (!entry.lastRainNotifyAt) return true;
  return Date.now() - entry.lastRainNotifyAt >= OPPOSITE_NOTIFY_COOLDOWN_MS;
}

export function markRainNotify(entry: RelayPhaseEntry): void {
  entry.lastRainNotifyAt = Date.now();
}

export function markClearNotify(entry: RelayPhaseEntry): void {
  entry.lastClearNotifyAt = Date.now();
}
