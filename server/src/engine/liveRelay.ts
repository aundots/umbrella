import { withDeadline } from '../kma/fetchUtil.js';
import {
  fetchLocationWeather,
  ncstPrecipType,
  ncstRn1,
} from '../kma/client.js';
import { buildForecastDetail } from '../kma/forecastDetail.js';
import { fetchVilageFcst } from '../kma/vilageFcst.js';
import { FcstSlot, ForecastDetail, PrecipType, VilageHourly } from '../kma/types.js';
import {
  analyzeNowcastArrival,
  analyzeVilageEnd,
  blendPrecipEnd,
  loadNowcastContext,
  mergeTimelineWithNowcast,
  nowcastConfidenceBoost,
  resolveDataSource,
  vilageSlotIsWet,
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
  const precipSlots = future.filter((s) => isPrecipitating(s.pty));

  let arrivalSlot: FcstSlot | null = null;
  if (!isPrecipitating(currentType)) {
    arrivalSlot = precipSlots[0] ?? null;
  }

  let endSlot: Date | null = null;
  if (isPrecipitating(currentType) || arrivalSlot) {
    let inPrecip = isPrecipitating(currentType);
    for (const s of future) {
      if (isPrecipitating(s.pty)) {
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
    const slot =
      fcst.find((s) => Math.abs(s.at.getTime() - target.getTime()) < 8 * 60000) ??
      fcst.find((s) => s.at >= target);
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

  let currentType = ncstPrecipType(ncst);
  let currentRate = rn1ToRateMmH(ncstRn1(ncst));
  if (nowcast.hsrRateMmH != null) {
    const hsr = nowcast.hsrRateMmH;
    if (isPrecipitating(currentType) || hsr >= 0.2) {
      currentRate = Math.max(currentRate, hsr);
      if (hsr >= 0.2) currentType = 'rain';
    }
  }

  const vilageNow = vilageNowSlot(vilageSlots, now);
  if (vilageNow && vilageSlotIsWet(vilageNow)) {
    if (vilageNow.pty !== 'none') currentType = vilageNow.pty;
    else currentType = 'rain';
    currentRate = Math.max(currentRate, vilageNow.pcpMm);
  }

  const precipNow = isPrecipitating(currentType) || currentRate >= 0.2;

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
  const blendedPeak = Math.max(peakRate, mapleArrival.peakRate, currentRate);

  const timeline = mergeTimelineWithNowcast(buildTimeline(now, fcst), nowcast, {
    precipNow,
    willArrive,
  });
  const vilageEnd = analyzeVilageEnd(now, vilageSlots, precipNow);
  let endAt = blendPrecipEnd(now, {
    precipNow,
    ultraEnd: endSlot,
    nowcast,
    timeline,
    vilageEnd,
    fcst,
  });

  const windDeg = getWindFromFcst(fcst);
  const terrain = computeTerrainContext(params.lat, params.lng, windDeg, null);

  const adjusted = applyTerrainAdjust(
    terrain,
    blendedPeak,
    inMinutes,
    endAt,
    willArrive,
  );

  let relayStatus: LiveRelayReport['relayStatus'] = 'clear';
  if (precipNow) relayStatus = 'live';
  else if (adjusted.willArrive) relayStatus = 'approaching';

  const confidence = Math.min(
    95,
    computeConfidence(currentType, fcst, adjusted.confidenceDelta) +
      nowcastConfidenceBoost(nowcast),
  );

  const detail = await detailPromise;

  const remainingMinutes = adjusted.endAt ? minutesUntil(now, adjusted.endAt) : null;
  const endSoon =
    precipNow &&
    remainingMinutes != null &&
    remainingMinutes > 0 &&
    remainingMinutes <= 30;

  return {
    locationId: params.locationId,
    locationName: params.locationName,
    observedAt: now.toISOString(),
    now: {
      precipitating: precipNow,
      type: currentType,
      rateMmH: Math.round(currentRate * 10) / 10,
    },
    arrival: {
      willArrive: adjusted.willArrive,
      inMinutes: adjusted.inMinutes,
      type: precipNow ? currentType : arrivalType,
      peakRateMmH: Math.round(adjusted.peakRateMmH * 10) / 10,
    },
    end: {
      willStop: precipNow || adjusted.willArrive,
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
  };
}

export { intensityLabel };
