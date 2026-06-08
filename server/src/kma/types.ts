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
}
