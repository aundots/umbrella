const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** KST wall-clock parts for the given instant (Vercel 등 UTC 서버에서도 동일). */
export function nowKstParts(now = new Date()) {
  const t = now.getTime() + KST_OFFSET_MS;
  const d = new Date(t);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

/** KMA baseDate(YYYYMMDD) + time(HHmm) — KST 기준 → UTC Date */
export function kstStringToDate(baseDate: string, time: string): Date {
  const y = Number(baseDate.slice(0, 4));
  const m = Number(baseDate.slice(4, 6)) - 1;
  const d = Number(baseDate.slice(6, 8));
  const h = Number(time.slice(0, 2));
  const min = Number(time.slice(2, 4) || '0');
  return new Date(Date.UTC(y, m, d, h - 9, min));
}

/** fcst key `YYYYMMDDHHmm` (KST) → Date */
export function fcstKeyToDate(key: string): Date {
  return kstStringToDate(key.slice(0, 8), key.slice(8, 12));
}

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0');
}

/** 레이더 API dateTime 후보 (KST, 5분 간격) */
export function candidateRadarDateTimesKst(now = new Date(), attempts = 6): string[] {
  const out: string[] = [];
  const kst = nowKstParts(new Date(now.getTime() - 20 * 60_000));
  const roundedMin = Math.floor(kst.minute / 5) * 5;
  let minute = roundedMin;
  let hour = kst.hour;
  let day = kst.day;
  let month = kst.month;
  let year = kst.year;

  for (let i = 0; i < attempts; i++) {
    out.push(`${year}${pad(month)}${pad(day)}${pad(hour)}${pad(minute)}`);
    minute -= 5;
    if (minute < 0) {
      minute += 60;
      hour -= 1;
      if (hour < 0) {
        hour = 23;
        const prev = kstStringToDate(`${year}${pad(month)}${pad(day)}`, '0000');
        const parts = nowKstParts(new Date(prev.getTime() - 60 * 60_000));
        year = parts.year;
        month = parts.month;
        day = parts.day;
      }
    }
  }
  return out;
}
