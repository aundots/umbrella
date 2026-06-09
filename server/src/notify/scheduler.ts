import { listNotifyTargets } from '../db/store.js';
import { buildLiveRelayReport } from '../engine/liveRelay.js';
import { isMtlsConfigured } from '../toss/mtls.js';
import { DEFAULT_PUSH_CONTEXT, sendFunctionalMessage } from '../toss/messenger.js';

const sent = new Map<string, number>();
const COOLDOWN_MS = 30 * 60 * 1000;

export interface NotifyScanResult {
  users: number;
  locations: number;
  triggered: number;
  pushed: number;
  skippedCooldown: number;
}

function isTossUserKey(userKey: string): boolean {
  return /^\d+$/.test(userKey);
}

function buildPushContext(locName: string, report: Awaited<ReturnType<typeof buildLiveRelayReport>>) {
  return {
    ...DEFAULT_PUSH_CONTEXT,
    location: locName,
    minutes: String(report.arrival.inMinutes ?? 0),
    status: report.relayStatus,
  };
}

async function trySendPush(
  userKey: string,
  locName: string,
  report: Awaited<ReturnType<typeof buildLiveRelayReport>>,
): Promise<boolean> {
  const templateCode = process.env.TOSS_PUSH_TEMPLATE_CODE;
  if (!isMtlsConfigured() || !templateCode || !isTossUserKey(userKey)) return false;

  const { status, data } = await sendFunctionalMessage({
    userKey,
    templateSetCode: templateCode,
    context: buildPushContext(locName, report),
  });

  if (data.resultType === 'SUCCESS') {
    console.log(`[NOTIFY] push sent user=${userKey} loc=${locName}`);
    return true;
  }

  console.warn(`[NOTIFY] push failed user=${userKey} status=${status}`, data.error);
  return false;
}

export async function runNotifyScan(): Promise<NotifyScanResult> {
  const targets = listNotifyTargets();
  const result: NotifyScanResult = {
    users: targets.length,
    locations: targets.reduce((n, t) => n + t.locations.length, 0),
    triggered: 0,
    pushed: 0,
    skippedCooldown: 0,
  };

  for (const { userKey, locations } of targets) {
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

        const eventKey = `${userKey}:${loc.id}:${report.relayStatus}:${report.arrival.inMinutes ?? 'now'}`;
        if (Date.now() - (sent.get(eventKey) ?? 0) < COOLDOWN_MS) {
          result.skippedCooldown += 1;
          continue;
        }

        sent.set(eventKey, Date.now());
        result.triggered += 1;
        console.log(
          `[NOTIFY] user=${userKey} [${loc.name}] ${report.relayStatus} ` +
            `in=${report.arrival.inMinutes ?? 0}min peak=${report.arrival.peakRateMmH}mm/h`,
        );

        if (await trySendPush(userKey, loc.name, report)) {
          result.pushed += 1;
        }
      } catch (e) {
        console.error(`[NOTIFY] ${loc.name}`, e);
      }
    }
  }

  return result;
}
