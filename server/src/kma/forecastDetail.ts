import { skyLabel } from './labels.js';
import { fetchVilageFcst } from './vilageFcst.js';
import { FcstSlot, ForecastDetail, DetailHourly, VilageHourly } from './types.js';

function ultraToDetail(slots: FcstSlot[]): DetailHourly[] {
  const now = new Date();
  return slots
    .filter((s) => s.at >= now)
    .slice(0, 12)
    .map((s) => ({
      at: s.at.toISOString(),
      source: 'ultra' as const,
      tempC: s.t1h,
      humidity: s.reh,
      sky: s.sky ? skyLabel(s.sky) : undefined,
      type: s.pty,
      rateMmH: s.rn1,
    }));
}

function vilageToDetail(slots: VilageHourly[]): DetailHourly[] {
  const now = new Date();
  return slots
    .filter((s) => s.at >= now)
    .slice(0, 24)
    .map((s) => ({
      at: s.at.toISOString(),
      source: 'vilage' as const,
      tempC: s.tempC,
      pop: s.pop,
      humidity: s.reh,
      windMs: s.wsd,
      sky: s.sky ? skyLabel(s.sky) : undefined,
      pcp: s.pcp,
      type: s.pty,
      rateMmH: s.pcpMm,
    }));
}

export async function buildForecastDetail(
  nx: number,
  ny: number,
  ncst: Map<string, string>,
  fcst: FcstSlot[],
): Promise<ForecastDetail> {
  const nowObs = {
    tempC: numOrUndef(ncst.get('T1H')),
    humidity: numOrUndef(ncst.get('REH')),
    sky: ncst.get('PTY') === '0' ? skyLabel(ncst.get('SKY')) : undefined,
    lightning: ncst.get('LGT') === '1' || Number(ncst.get('LGT')) > 0,
  };

  let vilageHourly: DetailHourly[] = [];
  let vilageAvailable = false;
  try {
    const vilage = await fetchVilageFcst(nx, ny);
    vilageHourly = vilageToDetail(vilage);
    vilageAvailable = vilageHourly.length > 0;
  } catch {
    vilageAvailable = false;
  }

  return {
    nowObs,
    ultraHourly: ultraToDetail(fcst),
    vilageHourly,
    vilageAvailable,
  };
}

function numOrUndef(val: string | undefined): number | undefined {
  if (val == null || val === '') return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}
