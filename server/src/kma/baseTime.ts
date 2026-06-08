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

export function parseKmaTime(baseDate: string, time: string): Date {
  const y = Number(baseDate.slice(0, 4));
  const m = Number(baseDate.slice(4, 6)) - 1;
  const d = Number(baseDate.slice(6, 8));
  const h = Number(time.slice(0, 2));
  const min = Number(time.slice(2, 4) || '0');
  return new Date(y, m, d, h, min);
}
