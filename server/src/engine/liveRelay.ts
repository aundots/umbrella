import {
  fetchLocationWeather,
  ncstPrecipType,
  ncstRn1,
} from '../kma/client.js';
import { buildForecastDetail } from '../kma/forecastDetail.js';
import { FcstSlot, ForecastDetail, PrecipType } from '../kma/types.js';
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

export async function buildLiveRelayReport(params: {
  locationId: string;
  locationName: string;
  lat: number;
  lng: number;
}): Promise<LiveRelayReport> {
  const now = new Date();
  const { nx, ny, ncst, fcst } = await fetchLocationWeather(params.lat, params.lng);

  const currentType = ncstPrecipType(ncst);
  const currentRate = rn1ToRateMmH(ncstRn1(ncst));
  const precipNow = isPrecipitating(currentType) || currentRate > 0;

  const { arrivalSlot, endSlot, peakRate } = analyzeFcst(now, fcst, currentType);

  let inMinutes: number | null = null;
  let arrivalType: PrecipType | null = null;
  let willArrive = false;

  if (arrivalSlot) {
    inMinutes = minutesUntil(now, arrivalSlot.at);
    arrivalType = arrivalSlot.pty;
    willArrive = inMinutes <= 60;
  }

  let endAt: Date | null = endSlot;
  if (precipNow && !endAt) {
    const lastPrecip = fcst.filter((s) => isPrecipitating(s.pty)).pop();
    if (lastPrecip) endAt = new Date(lastPrecip.at.getTime() + 30 * 60000);
  }

  const windDeg = getWindFromFcst(fcst);
  const terrain = computeTerrainContext(params.lat, params.lng, windDeg, null);

  const adjusted = applyTerrainAdjust(
    terrain,
    Math.max(peakRate, currentRate),
    inMinutes,
    endAt,
    willArrive,
  );

  let relayStatus: LiveRelayReport['relayStatus'] = 'clear';
  if (precipNow) relayStatus = 'live';
  else if (adjusted.willArrive) relayStatus = 'approaching';

  const confidence = computeConfidence(currentType, fcst, adjusted.confidenceDelta);

  let detail: ForecastDetail | undefined;
  try {
    detail = await buildForecastDetail(nx, ny, ncst, fcst);
  } catch {
    detail = undefined;
  }

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
      remainingMinutes: adjusted.endAt ? minutesUntil(now, adjusted.endAt) : null,
    },
    confidence,
    relayStatus,
    spatial: {
      resolutionM: 500,
      awsDistanceM: null,
      dataSource: 'fcst',
    },
    terrain,
    timeline: buildTimeline(now, fcst),
    detail,
  };
}

export { intensityLabel };
