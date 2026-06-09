import { withDeadline } from '../kma/fetchUtil.js';
import { fetchMapleAtLocation, MapleForecastSlot } from '../kma/maple.js';
import { PrecipType } from '../kma/types.js';
import { fetchHsrRainGrid, rainRateAt } from '../kma/wthrRadar.js';

const NOWCAST_BUDGET_MS = 12_000;

export interface NowcastContext {
  hsrAvailable: boolean;
  mapleAvailable: boolean;
  hsrObsTime: string | null;
  hsrRateMmH: number | null;
  mapleBaseTime: string | null;
  mapleSlots: MapleForecastSlot[];
}

async function loadNowcastContextInner(lat: number, lng: number): Promise<NowcastContext> {
  const empty: NowcastContext = {
    hsrAvailable: false,
    mapleAvailable: false,
    hsrObsTime: null,
    hsrRateMmH: null,
    mapleBaseTime: null,
    mapleSlots: [],
  };

  const [hsrGrid, maple] = await Promise.all([
    fetchHsrRainGrid().catch(() => null),
    fetchMapleAtLocation(lat, lng).catch(() => ({ baseTime: null, slots: [] })),
  ]);

  if (hsrGrid) {
    const rate = rainRateAt(hsrGrid, lat, lng);
    empty.hsrAvailable = true;
    empty.hsrObsTime = hsrGrid.dateTime;
    empty.hsrRateMmH = rate;
  }

  if (maple.slots.length > 0) {
    empty.mapleAvailable = true;
    empty.mapleBaseTime = maple.baseTime;
    empty.mapleSlots = maple.slots;
  }

  return empty;
}

export async function loadNowcastContext(lat: number, lng: number): Promise<NowcastContext> {
  const empty: NowcastContext = {
    hsrAvailable: false,
    mapleAvailable: false,
    hsrObsTime: null,
    hsrRateMmH: null,
    mapleBaseTime: null,
    mapleSlots: [],
  };
  return withDeadline(loadNowcastContextInner(lat, lng), NOWCAST_BUDGET_MS, empty);
}

function rateToType(rate: number): PrecipType {
  return rate > 0.05 ? 'rain' : 'none';
}

export function mergeTimelineWithNowcast(
  fcstTimeline: Array<{ offsetMin: number; rateMmH: number; type: PrecipType }>,
  ctx: NowcastContext,
): Array<{ offsetMin: number; rateMmH: number; type: PrecipType }> {
  const mapleByOffset = new Map(ctx.mapleSlots.map((s) => [s.offsetMin, s.rateMmH]));

  return fcstTimeline.map((slot) => {
    let rate = slot.rateMmH;
    if (slot.offsetMin === 0 && ctx.hsrRateMmH != null) {
      rate = Math.max(rate, ctx.hsrRateMmH);
    }
    const mapleRate = mapleByOffset.get(slot.offsetMin);
    if (mapleRate != null) {
      rate = Math.max(rate, mapleRate);
    }
    const type = rate > 0.05 ? rateToType(rate) : slot.type;
    return { offsetMin: slot.offsetMin, rateMmH: Math.round(rate * 10) / 10, type };
  });
}

export function analyzeNowcastArrival(
  now: Date,
  ctx: NowcastContext,
  currentPrecip: boolean,
): { inMinutes: number | null; peakRate: number; willArrive: boolean } {
  if (currentPrecip) {
    return { inMinutes: null, peakRate: ctx.hsrRateMmH ?? 0, willArrive: false };
  }

  const future = ctx.mapleSlots
    .filter((s) => s.rateMmH > 0.1)
    .sort((a, b) => a.offsetMin - b.offsetMin);

  const first = future[0];
  if (!first) {
    return { inMinutes: null, peakRate: 0, willArrive: false };
  }

  const peakRate = future.reduce((m, s) => Math.max(m, s.rateMmH), 0);
  const willArrive = first.offsetMin <= 60;
  return {
    inMinutes: first.offsetMin,
    peakRate,
    willArrive,
  };
}

export function nowcastConfidenceBoost(ctx: NowcastContext): number {
  let d = 0;
  if (ctx.hsrAvailable) d += 8;
  if (ctx.mapleAvailable) d += 7;
  if (ctx.hsrAvailable && ctx.mapleAvailable) d += 5;
  return d;
}

export function resolveDataSource(ctx: NowcastContext): 'aws' | 'hsr' | 'blended' | 'fcst' {
  if (ctx.hsrAvailable && ctx.mapleAvailable) return 'blended';
  if (ctx.hsrAvailable) return 'hsr';
  return 'fcst';
}
