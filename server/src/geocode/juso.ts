import {
  dedupePlaces,
  formatKoreanPlace,
  utmkToWgs84,
  type KoreanAddressFields,
} from './korean.js';
import type { GeocodePlace } from './types.js';

const JUSO_SEARCH = 'https://www.juso.go.kr/addrlink/addrLinkApi.do';
const JUSO_COORD = 'https://www.juso.go.kr/addrlink/addrCoordApi.do';

interface JusoItem {
  roadAddr: string;
  jibunAddr: string;
  siNm: string;
  sggNm: string;
  emdNm: string;
  bdNm?: string;
  admCd: string;
  rnMgtSn: string;
  udrtYn: string;
  buldMnnm: string;
  buldSlno: string;
}

interface JusoSearchResponse {
  results?: {
    common?: { errorCode?: string; totalCount?: string };
    juso?: JusoItem[];
  };
}

interface JusoCoordResponse {
  results?: {
    common?: { errorCode?: string };
    juso?: Array<{ entX?: string; entY?: string }>;
  };
}

function jusoToAddressFields(item: JusoItem): KoreanAddressFields {
  return {
    city: item.siNm,
    borough: item.sggNm,
    suburb: item.emdNm,
    building: item.bdNm,
  };
}

async function fetchJusoCoord(item: JusoItem, confmKey: string): Promise<{ lat: number; lng: number } | null> {
  const q = new URLSearchParams({
    confmKey,
    resultType: 'json',
    admCd: item.admCd,
    rnMgtSn: item.rnMgtSn,
    udrtYn: item.udrtYn || '0',
    buldMnnm: item.buldMnnm || '0',
    buldSlno: item.buldSlno || '0',
  });

  const res = await fetch(`${JUSO_COORD}?${q}`);
  if (!res.ok) return null;

  const data = (await res.json()) as JusoCoordResponse;
  if (data.results?.common?.errorCode !== '0') return null;

  const coord = data.results?.juso?.[0];
  const x = Number(coord?.entX);
  const y = Number(coord?.entY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  return utmkToWgs84(x, y);
}

export async function searchJusoPlaces(query: string, confmKey: string): Promise<GeocodePlace[]> {
  const q = new URLSearchParams({
    confmKey,
    resultType: 'json',
    currentPage: '1',
    countPerPage: '15',
    keyword: query.trim(),
  });

  const res = await fetch(`${JUSO_SEARCH}?${q}`);
  if (!res.ok) throw new Error(`juso HTTP ${res.status}`);

  const data = (await res.json()) as JusoSearchResponse;
  if (data.results?.common?.errorCode !== '0') return [];

  const items = data.results?.juso ?? [];
  const places: GeocodePlace[] = [];

  for (const item of items.slice(0, 10)) {
    const coords = await fetchJusoCoord(item, confmKey);
    if (!coords) continue;

    const fields = jusoToAddressFields(item);
    const label = formatKoreanPlace(fields, item.roadAddr, item.bdNm || item.emdNm);

    places.push({
      name: item.bdNm ? `${item.bdNm} · ${item.emdNm}` : label.name,
      address: item.roadAddr || item.jibunAddr || label.address,
      lat: coords.lat,
      lng: coords.lng,
    });
  }

  return dedupePlaces(places, 15);
}
