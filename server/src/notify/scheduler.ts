import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { listLocations } from '../db/store.js';
import { buildLiveRelayReport } from '../engine/liveRelay.js';
import { isMtlsConfigured } from '../toss/mtls.js';
import { sendFunctionalMessage } from '../toss/messenger.js';

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

function isTossUserKey(userKey: string): boolean {
  return /^\d+$/.test(userKey);
}

function buildPushContext(locName: string, report: Awaited<ReturnType<typeof buildLiveRelayReport>>) {
  return {
    location: locName,
    minutes: String(report.arrival.inMinutes ?? 0),
    status: report.relayStatus,
  };
}

async function trySendPush(
  userKey: string,
  locName: string,
  report: Awaited<ReturnType<typeof buildLiveRelayReport>>,
): Promise<void> {
  const templateCode = process.env.TOSS_PUSH_TEMPLATE_CODE;
  if (!isMtlsConfigured() || !templateCode || !isTossUserKey(userKey)) return;

  const { status, data } = await sendFunctionalMessage({
    userKey,
    templateSetCode: templateCode,
    context: buildPushContext(locName, report),
  });

  if (data.resultType === 'SUCCESS') {
    console.log(`[NOTIFY] push sent user=${userKey} loc=${locName}`);
    return;
  }

  console.warn(`[NOTIFY] push failed user=${userKey} status=${status}`, data.error);
}

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

        await trySendPush(userKey, loc.name, report);
      } catch (e) {
        console.error(`[NOTIFY] ${loc.name}`, e);
      }
    }
  }
}
