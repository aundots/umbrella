import type { LiveRelayReport } from '../engine/liveRelay.js';
import {
  HSR_PRECIP_THRESHOLD,
  slotIsWet,
  TIMELINE_NOISE_FLOOR,
} from '../engine/nowcastBlend.js';
import type { PrecipType } from '../kma/types.js';

/** 종료 알림 전 — 여러 소스가 모두 말려 있을 때만 true (오경보 종료 방지) */
export function isDryForClearNotify(report: LiveRelayReport): boolean {
  if (report.now.precipitating || report.relayStatus === 'live') return false;

  const t0 = report.timeline.find((s) => s.offsetMin === 0);
  if (t0 && slotIsWet(t0.rateMmH, t0.type as PrecipType)) return false;

  const obs = report.observation;
  if (!obs) return report.relayStatus === 'clear' && !report.now.precipitating;

  if (obs.ncstPrecipitating || obs.ncstRn1 >= 0.1) return false;
  if (obs.hsrRateMmH != null && obs.hsrRateMmH >= HSR_PRECIP_THRESHOLD) return false;
  if (obs.mapleRateMmH != null && obs.mapleRateMmH >= TIMELINE_NOISE_FLOOR) return false;
  if (obs.vilagePrecipitating) return false;
  if (obs.ultraFcstWet) return false;

  return true;
}
