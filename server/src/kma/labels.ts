import { PrecipType } from './types.js';

export function skyLabel(code: string | undefined): string {
  switch (code) {
    case '1':
      return '맑음';
    case '3':
      return '구름많음';
    case '4':
      return '흐림';
    default:
      return '—';
  }
}

export function parsePcp(val: string | undefined): string {
  if (!val || val === '강수없음' || val === '0') return '없음';
  return val;
}

export function pcpToMm(val: string | undefined): number {
  if (!val || val === '강수없음') return 0;
  const n = parseFloat(val.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export function precipLabelKo(type: PrecipType | string): string {
  switch (type) {
    case 'rain':
      return '비';
    case 'snow':
      return '눈';
    case 'mixed':
      return '비/눈';
    default:
      return '없음';
  }
}
