function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0');
}

export function getUltraNcstBaseTime(now = new Date()): { baseDate: string; baseTime: string } {
  const d = new Date(now);
  d.setMinutes(d.getMinutes() - 10);
  const baseDate = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const baseTime = `${pad(d.getHours())}00`;
  return { baseDate, baseTime };
}

export function getUltraFcstBaseTime(now = new Date()): { baseDate: string; baseTime: string } {
  const d = new Date(now);
  const min = d.getMinutes();
  if (min < 30) {
    d.setMinutes(0, 0, 0);
  } else {
    d.setMinutes(30, 0, 0);
  }
  const baseDate = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const baseTime = `${pad(d.getHours())}${pad(d.getMinutes())}`;
  return { baseDate, baseTime };
}

/** 동네예보 발표 시각 (02·05·08·11·14·17·20·23시) */
export function getVilageFcstBaseTime(now = new Date()): { baseDate: string; baseTime: string } {
  const baseHours = [23, 20, 17, 14, 11, 8, 5, 2];
  const d = new Date(now);
  d.setMinutes(d.getMinutes() - 15);

  const hour = d.getHours();
  const picked = baseHours.find((h) => hour >= h);
  if (picked != null) {
    return {
      baseDate: `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`,
      baseTime: `${pad(picked)}00`,
    };
  }

  const prev = new Date(d);
  prev.setDate(prev.getDate() - 1);
  return {
    baseDate: `${prev.getFullYear()}${pad(prev.getMonth() + 1)}${pad(prev.getDate())}`,
    baseTime: '2300',
  };
}

export function parseKmaTime(baseDate: string, time: string): Date {
  const y = Number(baseDate.slice(0, 4));
  const m = Number(baseDate.slice(4, 6)) - 1;
  const d = Number(baseDate.slice(6, 8));
  const h = Number(time.slice(0, 2));
  const min = Number(time.slice(2, 4) || '0');
  return new Date(y, m, d, h, min);
}
