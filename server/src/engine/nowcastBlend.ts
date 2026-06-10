import { withDeadline } from '../kma/fetchUtil.js';
import { fetchMapleAtLocation, MapleForecastSlot } from '../kma/maple.js';
import { FcstSlot, PrecipType, VilageHourly } from '../kma/types.js';
import { fetchHsrRainGrid, rainRateAt } from '../kma/wthrRadar.js';

const RATE_END_THRESHOLD = 0.05;
/** MAPLE/HSR below this (mm/h) must not override ultra PTY=none on the timeline */
const TIMELINE_NOISE_FLOOR = 0.25;
const POP_END_THRESHOLD = 30;

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
  opts?: { precipNow?: boolean; willArrive?: boolean },
): Array<{ offsetMin: number; rateMmH: number; type: PrecipType }> {
  const mapleByOffset = new Map(ctx.mapleSlots.map((s) => [s.offsetMin, s.rateMmH]));
  const precipNow = opts?.precipNow ?? false;
  const willArrive = opts?.willArrive ?? false;

  return fcstTimeline.map((slot) => {
    let rate = slot.rateMmH;
    const fcstWet = slot.type !== 'none' || slot.rateMmH > 0;

    if (slot.offsetMin === 0 && ctx.hsrRateMmH != null) {
      const hsr = ctx.hsrRateMmH;
      if (precipNow || fcstWet || hsr >= TIMELINE_NOISE_FLOOR) {
        rate = Math.max(rate, hsr);
      }
    }

    const mapleRate = mapleByOffset.get(slot.offsetMin);
    if (mapleRate != null) {
      const allowMaple =
        precipNow ||
        willArrive ||
        fcstWet ||
        mapleRate >= TIMELINE_NOISE_FLOOR;
      if (allowMaple) {
        rate = Math.max(rate, mapleRate);
      }
    }

    let type = slot.type;
    if (type === 'none' && rate >= TIMELINE_NOISE_FLOOR) {
      type = 'rain';
    } else if (type !== 'none' && rate <= RATE_END_THRESHOLD) {
      type = slot.type;
    }

    const displayRate = type === 'none' ? 0 : Math.round(rate * 10) / 10;
    return { offsetMin: slot.offsetMin, rateMmH: displayRate, type };
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

function slotIsWet(rateMmH: number, type: PrecipType): boolean {
  return rateMmH > RATE_END_THRESHOLD || type !== 'none';
}

function vilageSlotIsWet(slot: VilageHourly): boolean {
  return (
    slot.pty !== 'none' ||
    (slot.pop ?? 0) >= POP_END_THRESHOLD ||
    slot.pcpMm >= 0.1
  );
}

/** MAPLE QPF: first future lead when rate drops after current precip. */
export function analyzeNowcastEnd(
  now: Date,
  ctx: NowcastContext,
  precipNow: boolean,
): Date | null {
  if (!precipNow || ctx.mapleSlots.length === 0) return null;

  const sorted = [...ctx.mapleSlots].sort((a, b) => a.offsetMin - b.offsetMin);
  let inPrecip = precipNow;

  for (const slot of sorted) {
    const wet = slot.rateMmH > RATE_END_THRESHOLD;
    if (inPrecip && !wet && slot.offsetMin > 0) {
      return new Date(now.getTime() + slot.offsetMin * 60000);
    }
    if (wet) inPrecip = true;
  }

  return null;
}

/** Blended 0–60 min timeline: first dry slot after precip. */
export function analyzeTimelineEnd(
  now: Date,
  timeline: Array<{ offsetMin: number; rateMmH: number; type: PrecipType }>,
  precipNow: boolean,
): Date | null {
  if (!precipNow) return null;

  let inPrecip = precipNow;
  for (const slot of [...timeline].sort((a, b) => a.offsetMin - b.offsetMin)) {
    const wet = slotIsWet(slot.rateMmH, slot.type);
    if (inPrecip && !wet && slot.offsetMin > 0) {
      return new Date(now.getTime() + slot.offsetMin * 60000);
    }
    if (wet) inPrecip = true;
  }

  return null;
}

/** Vilage hourly: longer-horizon PTY/POP end after current rain. */
export function analyzeVilageEnd(
  now: Date,
  vilage: VilageHourly[],
  precipNow: boolean,
): Date | null {
  if (!precipNow || vilage.length === 0) return null;

  let inPrecip = precipNow;
  for (const slot of vilage.filter((s) => s.at > now).sort((a, b) => a.at.getTime() - b.at.getTime())) {
    const wet = vilageSlotIsWet(slot);
    if (inPrecip && !wet) return slot.at;
    if (wet) inPrecip = true;
  }

  return null;
}

export interface BlendPrecipEndInput {
  precipNow: boolean;
  ultraEnd: Date | null;
  nowcast: NowcastContext;
  timeline: Array<{ offsetMin: number; rateMmH: number; type: PrecipType }>;
  vilageEnd: Date | null;
  fcst: FcstSlot[];
}

function isPrecipitating(type: PrecipType): boolean {
  return type !== 'none';
}

/** Combine ultra, MAPLE, timeline, and vilage into a single end time. */
export function blendPrecipEnd(now: Date, input: BlendPrecipEndInput): Date | null {
  if (!input.precipNow) return input.ultraEnd;

  const mapleEnd = analyzeNowcastEnd(now, input.nowcast, input.precipNow);
  const timelineEnd = analyzeTimelineEnd(now, input.timeline, input.precipNow);

  let endAt: Date | null = null;

  if (mapleEnd) {
    endAt = mapleEnd;
  } else if (timelineEnd || input.ultraEnd) {
    const candidates = [timelineEnd, input.ultraEnd].filter(Boolean) as Date[];
    endAt = new Date(Math.max(...candidates.map((d) => d.getTime())));
  }

  const shortTermMinutes = endAt
    ? Math.max(0, Math.round((endAt.getTime() - now.getTime()) / 60000))
    : null;

  if (
    input.vilageEnd &&
    (endAt == null || (shortTermMinutes != null && shortTermMinutes >= 55))
  ) {
    endAt =
      endAt == null
        ? input.vilageEnd
        : new Date(Math.max(endAt.getTime(), input.vilageEnd.getTime()));
  }

  if (!endAt) {
    const lastPrecip = input.fcst.filter((s) => isPrecipitating(s.pty)).pop();
    if (lastPrecip) endAt = new Date(lastPrecip.at.getTime() + 30 * 60000);
  }

  return endAt;
}
