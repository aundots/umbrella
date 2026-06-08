import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { listLocations } from '../db/store.js';
import { buildLiveRelayReport } from '../engine/liveRelay.js';

const sent = new Map<string, number>();
const COOLDOWN_MS = 30 * 60 * 1000;

const DB_PATH = join(dirname(fileURLToPath(import.meta.url)), '../../data/db.json');

function listAllUserKeys(): string[] {
  if (!existsSync(DB_PATH)) return [];
  const data = JSON.parse(readFileSync(DB_PATH, 'utf-8')) as {
    locations: Array<{ userKey: string }>;
  };
  return [...new Set(data.locations.map((l) => l.userKey))];
}

/** MVP: 조건 충족 시 콘솔 로그. 토스 mTLS 푸시는 템플릿 승인 후 연동 */
export async function runNotifyScan(): Promise<void> {
  for (const userKey of listAllUserKeys()) {
    const locations = listLocations(userKey).filter((l) => l.notifyEnabled);
    for (const loc of locations) {
      try {
        const report = await buildLiveRelayReport({
          locationId: loc.id,
          locationName: loc.name,
          lat: loc.lat,
          lng: loc.lng,
        });

        const shouldNotify =
          report.now.precipitating ||
          (report.arrival.willArrive &&
            report.arrival.inMinutes != null &&
            report.arrival.inMinutes <= loc.notifyBeforeMin);

        if (!shouldNotify) continue;

        const eventKey = `${loc.id}:${report.relayStatus}:${report.arrival.inMinutes ?? 'now'}`;
        if (Date.now() - (sent.get(eventKey) ?? 0) < COOLDOWN_MS) continue;

        sent.set(eventKey, Date.now());
        console.log(
          `[NOTIFY] user=${userKey} [${loc.name}] ${report.relayStatus} ` +
            `in=${report.arrival.inMinutes ?? 0}min peak=${report.arrival.peakRateMmH}mm/h`,
        );
      } catch (e) {
        console.error(`[NOTIFY] ${loc.name}`, e);
      }
    }
  }
}
