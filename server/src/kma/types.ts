export type PrecipType = 'none' | 'rain' | 'snow' | 'mixed';

export const PTY_MAP: Record<string, PrecipType> = {
  '0': 'none',
  '1': 'rain',
  '2': 'mixed',
  '3': 'snow',
  '5': 'rain',
  '6': 'mixed',
  '7': 'snow',
};

export interface KmaItem {
  category: string;
  fcstDate?: string;
  fcstTime?: string;
  obsrValue?: string;
  fcstValue?: string;
}

export interface FcstSlot {
  at: Date;
  pty: PrecipType;
  rn1: number;
  uuu?: number;
  vvv?: number;
  t1h?: number;
  reh?: number;
  sky?: string;
  lgt?: boolean;
}

export interface VilageHourly {
  at: Date;
  tempC?: number;
  pop?: number;
  pcp: string;
  pcpMm: number;
  reh?: number;
  wsd?: number;
  sky?: string;
  pty: PrecipType;
}

export interface DetailHourly {
  at: string;
  source: 'ultra' | 'vilage';
  tempC?: number;
  pop?: number;
  humidity?: number;
  windMs?: number;
  sky?: string;
  pcp?: string;
  type: PrecipType;
  rateMmH?: number;
}

export interface RadarFrame {
  time: string;
  file: string;
  imageUrl: string;
}

export interface ForecastDetail {
  nowObs: {
    tempC?: number;
    humidity?: number;
    sky?: string;
    lightning?: boolean;
  };
  ultraHourly: DetailHourly[];
  vilageHourly: DetailHourly[];
  vilageAvailable: boolean;
}
