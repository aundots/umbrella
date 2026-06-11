import { kstStringToDate, nowKstParts } from './kst.js';

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0');
}

export function getUltraNcstBaseTime(now = new Date()): { baseDate: string; baseTime: string } {
  const kst = nowKstParts(now);
  const shifted = kstStringToDate(
    `${kst.year}${pad(kst.month)}${pad(kst.day)}`,
    `${pad(kst.hour)}${pad(kst.minute)}`,
  );
  const d = new Date(shifted.getTime() - 10 * 60_000);
  const parts = nowKstParts(d);
  return {
    baseDate: `${parts.year}${pad(parts.month)}${pad(parts.day)}`,
    baseTime: `${pad(parts.hour)}00`,
  };
}

/** 초단기예보는 매시 30·45분경 발표 — 미발표 슬롯 요청 시 NO_DATA */
export function getUltraFcstBaseTime(now = new Date()): { baseDate: string; baseTime: string } {
  const kst = nowKstParts(now);
  const shifted = kstStringToDate(
    `${kst.year}${pad(kst.month)}${pad(kst.day)}`,
    `${pad(kst.hour)}${pad(kst.minute)}`,
  );
  const lagged = new Date(shifted.getTime() - 35 * 60_000);
  const parts = nowKstParts(lagged);
  const minute = parts.minute < 30 ? 0 : 30;
  return {
    baseDate: `${parts.year}${pad(parts.month)}${pad(parts.day)}`,
    baseTime: `${pad(parts.hour)}${pad(minute)}`,
  };
}

/** 동네예보 발표 시각 (02·05·08·11·14·17·20·23시 KST) */
export function getVilageFcstBaseTime(now = new Date()): { baseDate: string; baseTime: string } {
  const baseHours = [23, 20, 17, 14, 11, 8, 5, 2];
  const kst = nowKstParts(new Date(now.getTime() - 15 * 60_000));

  const picked = baseHours.find((h) => kst.hour >= h);
  if (picked != null) {
    return {
      baseDate: `${kst.year}${pad(kst.month)}${pad(kst.day)}`,
      baseTime: `${pad(picked)}00`,
    };
  }

  const prev = kstStringToDate(`${kst.year}${pad(kst.month)}${pad(kst.day)}`, '0000');
  const prevParts = nowKstParts(new Date(prev.getTime() - 24 * 60 * 60_000));
  return {
    baseDate: `${prevParts.year}${pad(prevParts.month)}${pad(prevParts.day)}`,
    baseTime: '2300',
  };
}

export function parseKmaTime(baseDate: string, time: string): Date {
  return kstStringToDate(baseDate, time);
}
