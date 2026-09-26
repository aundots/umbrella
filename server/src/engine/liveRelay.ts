import { withDeadline } from '../kma/fetchUtil.js';
import {
  fetchLocationWeather,
  ncstPrecipType,
  ncstRn1,
} from '../kma/client.js';
import { skyLabel } from '../kma/labels.js';
import { buildForecastDetail } from '../kma/forecastDetail.js';
import { fetchVilageFcst } from '../kma/vilageFcst.js';
import { FcstSlot, ForecastDetail, PrecipType, VilageHourly } from '../kma/types.js';
import {
  analyzeNowcastArrival,
  analyzeVilageEnd,
  blendPrecipEnd,
  deriveArrivalFromTimeline,
  fcstSlotWet,
  HSR_CONFIRM_THRESHOLD,
  HSR_PRECIP_THRESHOLD,
  loadNowcastContext,
  mergeTimelineWithNowcast,
  nowcastConfidenceBoost,
  resolveDataSource,
<<<<<<< HEAD
=======
  TIMELINE_NOISE_FLOOR,
  timelinePrecipitatingNow,
  vilageSlotIsWet,
>>>>>>> 8dd8a7f (변경 내용)
} from './nowcastBlend.js';
import {
  applyTerrainAdjust,
  computeTerrainContext,
  getWindFromFcst,
} from './terrain.js';

export interface LiveRelayReport {
  locationId: string;
  locationName: string;
  observedAt: string;
  now: {
    precipitating: boolean;
    type: PrecipType;
    rateMmH: number;
    /** Current sky (맑음/구름많음/흐림) from KMA observation when not precipitating. */
    sky?: string;
  };
  arrival: {
    willArrive: boolean;
    inMinutes: number | null;
    type: PrecipType | null;
    peakRateMmH: number;
  };
  end: {
    willStop: boolean;
    at: string | null;
    remainingMinutes: number | null;
    /** True when rain is active and predicted to stop within ~30 minutes. */
    soon: boolean;
  };
  confidence: number;
  relayStatus: 'live' | 'approaching' | 'clear';
  spatial: {
    resolutionM: number;
    awsDistanceM: number | null;
    dataSource: 'aws' | 'hsr' | 'blended' | 'fcst';
  };
  terrain: ReturnType<typeof computeTerrainContext> | null;
  timeline: Array<{ offsetMin: number; rateMmH: number; type: PrecipType }>;
  detail?: ForecastDetail;
  /** 알림용 다중 소스 관측 스냅샷 (종료 알림 건조 확인) */
  observation: {
    ncstPrecipitating: boolean;
    ncstRn1: number;
    hsrRateMmH: number | null;
    mapleRateMmH: number | null;
    vilagePrecipitating: boolean;
    ultraFcstWet: boolean;
  };
}

function isPrecipitating(type: PrecipType): boolean {
  return type !== 'none';
}

function rn1ToRateMmH(rn1: number): number {
  return rn1;
}

function intensityLabel(rate: number): string {
  if (rate <= 1) return '가벼움';
  if (rate <= 4) return '보통';
  return '강함';
}

function minutesUntil(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000));
}

function resolveNowSky(
  ncst: Map<string, string>,
  vilageNow: VilageHourly | null,
  fcst: FcstSlot[],
  now: Date,
): string | undefined {
  const pty = ncst.get('PTY');
  if (pty === '0' || pty == null) {
    const label = skyLabel(ncst.get('SKY'));
    if (label !== '—') return label;
  }
  if (vilageNow?.sky) {
    const label = skyLabel(vilageNow.sky);
    if (label !== '—') return label;
  }
  const nearSlot =
    fcst.find((s) => Math.abs(s.at.getTime() - now.getTime()) < 8 * 60000) ?? fcst[0];
  if (nearSlot?.sky) {
    const label = skyLabel(nearSlot.sky);
    if (label !== '—') return label;
  }
  return undefined;
}

function vilageNowSlot(vilage: VilageHourly[], now: Date): VilageHourly | null {
  if (vilage.length === 0) return null;
  let best: VilageHourly | null = null;
  let bestDelta = Infinity;
  for (const slot of vilage) {
    const delta = Math.abs(slot.at.getTime() - now.getTime());
    if (delta < bestDelta && delta <= 90 * 60_000) {
      bestDelta = delta;
      best = slot;
    }
  }
  return best;
}

function analyzeFcst(now: Date, fcst: FcstSlot[], currentType: PrecipType) {
  const future = fcst.filter((s) => s.at > now);
  const precipSlots = future.filter((s) => fcstSlotWet(s));

  let arrivalSlot: FcstSlot | null = null;
  if (!isPrecipitating(currentType)) {
    arrivalSlot = precipSlots[0] ?? null;
  }

  let endSlot: Date | null = null;
  if (isPrecipitating(currentType) || arrivalSlot) {
    let inPrecip = isPrecipitating(currentType);
    for (const s of future) {
      if (fcstSlotWet(s)) {
        inPrecip = true;
      } else if (inPrecip) {
        endSlot = s.at;
        break;
      }
    }
    if (inPrecip && !endSlot && future.length > 0) {
      endSlot = future[future.length - 1].at;
    }
  }

  const peakRate = precipSlots.reduce((max, s) => Math.max(max, rn1ToRateMmH(s.rn1)), 0);

  return { arrivalSlot, endSlot, peakRate, precipSlots };
}

function buildTimeline(now: Date, fcst: FcstSlot[]): LiveRelayReport['timeline'] {
  const offsets = [0, 10, 20, 30, 40, 50, 60];
  return offsets.map((offsetMin) => {
    const target = new Date(now.getTime() + offsetMin * 60000);
    const nearestSlot = fcst.find(
      (s) => Math.abs(s.at.getTime() - target.getTime()) < 8 * 60000,
    );
    const slot =
      offsetMin === 0
        ? nearestSlot
        : nearestSlot ?? fcst.find((s) => s.at >= target);
    if (!slot) return { offsetMin, rateMmH: 0, type: 'none' as PrecipType };
    return { offsetMin, rateMmH: rn1ToRateMmH(slot.rn1), type: slot.pty };
  });
}

function computeConfidence(
  ncstType: PrecipType,
  fcst: FcstSlot[],
  terrainDelta: number,
): number {
  let c = 70;
  const nowSlot = fcst[0];
  if (nowSlot && nowSlot.pty === ncstType) c += 10;
  if (fcst.length >= 4) c += 5;
  c += terrainDelta;
  return Math.min(95, Math.max(40, c));
}

export interface LiveRelayReportOptions {
  /** Skip vilage forecast detail (notify cron — saves KMA round-trips). */
  skipDetail?: boolean;
}

export async function buildLiveRelayReport(
  params: {
    locationId: string;
    locationName: string;
    lat: number;
    lng: number;
  },
  options: LiveRelayReportOptions = {},
): Promise<LiveRelayReport> {
  const now = new Date();
  const weatherPromise = fetchLocationWeather(params.lat, params.lng);
  const [{ nx, ny, ncst, fcst }, nowcast, vilageSlots] = await Promise.all([
    weatherPromise,
    loadNowcastContext(params.lat, params.lng),
    weatherPromise
      .then(({ nx, ny }) => withDeadline(fetchVilageFcst(nx, ny), 5_000, []).catch(() => [])),
  ]);
  const detailPromise = options.skipDetail
    ? Promise.resolve(undefined as ForecastDetail | undefined)
    : withDeadline(
        buildForecastDetail(nx, ny, ncst, fcst),
        5_000,
        undefined as ForecastDetail | undefined,
      ).catch(() => undefined);

  // Official ultra-short-term observation (초단기실황) is the ground truth for
  // whether it is raining right now.
  const obsType = ncstPrecipType(ncst);
  const obsRate = rn1ToRateMmH(ncstRn1(ncst));
  const obsPrecip = isPrecipitating(obsType) || obsRate >= 0.1;

  let currentType = obsType;
  let currentRate = obsRate;
  if (nowcast.hsrRateMmH != null) {
    const hsr = nowcast.hsrRateMmH;
    // Radar may confirm/intensify precip the observation already sees, but it must
    // clear a stronger bar before overriding a dry observation — otherwise light
    // non-meteorological echoes surface as false "raining now".
    const hsrConfirmsNow = obsPrecip
      ? hsr >= HSR_PRECIP_THRESHOLD
      : hsr >= HSR_CONFIRM_THRESHOLD;
    if (hsrConfirmsNow) {
      currentRate = Math.max(currentRate, hsr);
      if (!isPrecipitating(currentType)) currentType = 'rain';
    }
  }

  const mapleNowRate =
    nowcast.mapleSlots.find((s) => s.offsetMin === 0)?.rateMmH ??
    nowcast.mapleSlots.find((s) => s.offsetMin <= 10)?.rateMmH ??
    null;
  if (
    mapleNowRate != null &&
    mapleNowRate >= TIMELINE_NOISE_FLOOR &&
    !isPrecipitating(currentType)
  ) {
    currentType = 'rain';
    currentRate = Math.max(currentRate, mapleNowRate);
  }

  const vilageNow = vilageNowSlot(vilageSlots, now);
<<<<<<< HEAD
  // Vilage is an hourly forecast whose "wet" flag includes POP probability; only its
  // actual precip categories (PTY / measurable PCP) may speak to current conditions.
  const vilageNowPrecip =
    vilageNow != null && (vilageNow.pty !== 'none' || vilageNow.pcpMm >= 0.1);
  if (vilageNow && vilageNowPrecip) {
    const ncstDry = !obsPrecip;
    const hsrDry =
      nowcast.hsrRateMmH == null || nowcast.hsrRateMmH < HSR_CONFIRM_THRESHOLD;
    // Never let an hourly forecast override a fresh, dry observation + radar.
    if (!(ncstDry && hsrDry)) {
=======
  if (vilageNow && vilageSlotIsWet(vilageNow)) {
    const ncstDry =
      !isPrecipitating(ncstPrecipType(ncst)) && ncstRn1(ncst) < 0.1;
    const hsrDry = nowcast.hsrRateMmH == null || nowcast.hsrRateMmH < HSR_PRECIP_THRESHOLD;
    const vilageObserved =
      vilageNow.pty !== 'none' || vilageNow.pcpMm >= 0.1;
    // 실측 강수(PTY/누적)는 ncst·HSR이 잠깐 말라도 유지. POP만 높은 시간대는 초단기가 말랐을 때만 반영.
    if (vilageObserved || !(ncstDry && hsrDry)) {
>>>>>>> 8dd8a7f (변경 내용)
      if (vilageNow.pty !== 'none') currentType = vilageNow.pty;
      else currentType = 'rain';
      currentRate = Math.max(currentRate, vilageNow.pcpMm);
    }
  }

  const precipNow = isPrecipitating(currentType) || currentRate >= HSR_PRECIP_THRESHOLD;

  const { arrivalSlot, endSlot, peakRate } = analyzeFcst(now, fcst, currentType);
  const mapleArrival = analyzeNowcastArrival(now, nowcast, precipNow);

  let inMinutes: number | null = null;
  let arrivalType: PrecipType | null = null;
  let willArrive = false;

  if (arrivalSlot) {
    inMinutes = minutesUntil(now, arrivalSlot.at);
    arrivalType = arrivalSlot.pty;
    willArrive = inMinutes <= 60;
  }
  if (mapleArrival.willArrive && mapleArrival.inMinutes != null) {
    if (inMinutes == null || mapleArrival.inMinutes < inMinutes) {
      inMinutes = mapleArrival.inMinutes;
      arrivalType = 'rain';
      willArrive = true;
    }
  }
  let blendedPeak = Math.max(peakRate, mapleArrival.peakRate, currentRate);

  const timeline = mergeTimelineWithNowcast(buildTimeline(now, fcst), nowcast, {
    precipNow,
    willArrive,
  });

  // "Raining now" stays anchored to the live observation + radar, which are already
  // folded into currentType/currentRate above. A forecast-driven timeline slot (ultra
  // short-term / vilage) must NOT flip the current status — a wet forecast slot for
  // this hour means rain is imminent and is surfaced through arrival below, not as
  // "raining now". This is what kept showing rain on clear skies.
  const precipNowFinal =
    isPrecipitating(currentType) || currentRate >= HSR_PRECIP_THRESHOLD;

  // Keep the timeline's "now" sample in sync with the observation-anchored status so
  // the 0–60 min graph and the arrival derivation never read a phantom current rain.
  const nowIdx = timeline.findIndex((s) => s.offsetMin === 0);
  if (nowIdx >= 0) {
    timeline[nowIdx] = {
      offsetMin: 0,
      rateMmH: precipNowFinal ? Math.round(currentRate * 10) / 10 : 0,
      type: precipNowFinal ? currentType : 'none',
    };
  }

  const timelineArrival = deriveArrivalFromTimeline(timeline, precipNowFinal);
  if (timelineArrival.willArrive) {
    if (
      inMinutes == null ||
      (timelineArrival.inMinutes != null && timelineArrival.inMinutes < inMinutes)
    ) {
      inMinutes = timelineArrival.inMinutes;
      arrivalType = timelineArrival.type;
    }
    willArrive = true;
    blendedPeak = Math.max(blendedPeak, timelineArrival.peakRate);
  }

  const vilageEnd = analyzeVilageEnd(now, vilageSlots, precipNowFinal);
  let endAt = blendPrecipEnd(now, {
    precipNow: precipNowFinal,
    ultraEnd: endSlot,
    nowcast,
    timeline,
    vilageEnd,
    fcst,
  });

  const windDeg = getWindFromFcst(fcst);
  const terrain = computeTerrainContext(params.lat, params.lng, windDeg, null);

  if (precipNowFinal) {
    willArrive = false;
    inMinutes = null;
  }

  const adjusted = applyTerrainAdjust(
    terrain,
    blendedPeak,
    inMinutes,
    endAt,
    willArrive,
  );

  let relayStatus: LiveRelayReport['relayStatus'] = 'clear';
  if (precipNowFinal) relayStatus = 'live';
  else if (adjusted.willArrive) relayStatus = 'approaching';

  const confidence = Math.min(
    95,
    computeConfidence(currentType, fcst, adjusted.confidenceDelta) +
      nowcastConfidenceBoost(nowcast),
  );

  const detail = await detailPromise;

  const remainingMinutes = adjusted.endAt ? minutesUntil(now, adjusted.endAt) : null;
  const endSoon =
    precipNowFinal &&
    remainingMinutes != null &&
    remainingMinutes > 0 &&
    remainingMinutes <= 30;

  const arrivalWillArrive = precipNowFinal ? false : adjusted.willArrive;
  const arrivalInMinutes = precipNowFinal ? null : adjusted.inMinutes;
  const nowSky = precipNowFinal ? undefined : resolveNowSky(ncst, vilageNow, fcst, now);

  const nearFcst =
    fcst.find((s) => Math.abs(s.at.getTime() - now.getTime()) < 8 * 60000) ?? fcst[0];

  return {
    locationId: params.locationId,
    locationName: params.locationName,
    observedAt: now.toISOString(),
    now: {
      precipitating: precipNowFinal,
      type: currentType,
      rateMmH: Math.round(currentRate * 10) / 10,
      ...(nowSky ? { sky: nowSky } : {}),
    },
    arrival: {
      willArrive: arrivalWillArrive,
      inMinutes: arrivalInMinutes,
      type: precipNowFinal ? currentType : arrivalType,
      peakRateMmH: Math.round(adjusted.peakRateMmH * 10) / 10,
    },
    end: {
      willStop: precipNowFinal || arrivalWillArrive,
      at: adjusted.endAt?.toISOString() ?? null,
      remainingMinutes,
      soon: endSoon,
    },
    confidence,
    relayStatus,
    spatial: {
      resolutionM: nowcast.hsrAvailable ? 500 : 1000,
      awsDistanceM: null,
      dataSource: resolveDataSource(nowcast),
    },
    terrain,
    timeline,
    detail,
    observation: {
      ncstPrecipitating: isPrecipitating(ncstPrecipType(ncst)),
      ncstRn1: ncstRn1(ncst),
      hsrRateMmH: nowcast.hsrRateMmH,
      mapleRateMmH: mapleNowRate,
      vilagePrecipitating: Boolean(
        vilageNow && (vilageNow.pty !== 'none' || vilageNow.pcpMm >= 0.1),
      ),
      ultraFcstWet: nearFcst ? fcstSlotWet(nearFcst) : false,
    },
  };
}

export { intensityLabel };
