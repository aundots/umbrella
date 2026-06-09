import { listNotifyTargets } from '../db/store.js';
import { loadRelayPhases, saveRelayPhases, type RelayPhase } from '../db/persistence.js';
import { buildLiveRelayReport } from '../engine/liveRelay.js';
import { isMtlsConfigured } from '../toss/mtls.js';
import {
  buildPushMsg,
  buildPushMsgClear,
  sendFunctionalMessage,
} from '../toss/messenger.js';

const sent = new Map<string, number>();
const COOLDOWN_MS = 30 * 60 * 1000;

export interface NotifyScanResult {
  users: number;
  locations: number;
  triggered: number;
  pushed: number;
  cleared: number;
  skippedCooldown: number;
}

function isTossUserKey(userKey: string): boolean {
  return /^\d+$/.test(userKey);
}

async function trySendPush(
  userKey: string,
  templateCode: string,
  context: Record<string, string>,
  locName: string,
  kind: 'rain' | 'clear',
): Promise<boolean> {
  if (!isMtlsConfigured() || !isTossUserKey(userKey)) return false;

  const { status, data } = await sendFunctionalMessage({
    userKey,
    templateSetCode: templateCode,
    context,
  });

  if (data.resultType === 'SUCCESS') {
    console.log(`[NOTIFY] ${kind} push sent user=${userKey} loc=${locName}`);
    return true;
  }

  console.warn(`[NOTIFY] ${kind} push failed user=${userKey} status=${status}`, data.error);
  return false;
}

function withinCooldown(eventKey: string): boolean {
  return Date.now() - (sent.get(eventKey) ?? 0) < COOLDOWN_MS;
}

function markSent(eventKey: string): void {
  sent.set(eventKey, Date.now());
}

export async function runNotifyScan(): Promise<NotifyScanResult> {
  const rainTemplate = process.env.TOSS_PUSH_TEMPLATE_CODE?.trim();
  const clearTemplate = process.env.TOSS_PUSH_TEMPLATE_CODE_CLEAR?.trim();

  const targets = await listNotifyTargets();
  const relayPhases = await loadRelayPhases();
  let relayDirty = false;

  const result: NotifyScanResult = {
    users: targets.length,
    locations: targets.reduce((n, t) => n + t.locations.length, 0),
    triggered: 0,
    pushed: 0,
    cleared: 0,
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

        const stateKey = `${userKey}:${loc.id}`;
        const prevStatus = relayPhases[stateKey];
        const currStatus = report.relayStatus as RelayPhase;
        if (prevStatus !== currStatus) {
          relayPhases[stateKey] = currStatus;
          relayDirty = true;
        }

        if (prevStatus === 'live' && currStatus === 'clear' && clearTemplate) {
          const eventKey = `${stateKey}:clear`;
          if (withinCooldown(eventKey)) {
            result.skippedCooldown += 1;
          } else {
            markSent(eventKey);
            result.triggered += 1;
            console.log(`[NOTIFY] user=${userKey} [${loc.name}] clear`);
            if (
              await trySendPush(
                userKey,
                clearTemplate,
                { msg: buildPushMsgClear(loc.name) },
                loc.name,
                'clear',
              )
            ) {
              result.cleared += 1;
            }
          }
        }

        const shouldNotifyRain =
          report.now.precipitating ||
          (report.arrival.willArrive &&
            report.arrival.inMinutes != null &&
            report.arrival.inMinutes <= loc.notifyBeforeMin);

        if (!shouldNotifyRain || !rainTemplate) continue;

        const eventKey = `${stateKey}:${currStatus}:${report.arrival.inMinutes ?? 'now'}`;
        if (withinCooldown(eventKey)) {
          result.skippedCooldown += 1;
          continue;
        }

        markSent(eventKey);
        result.triggered += 1;
        console.log(
          `[NOTIFY] user=${userKey} [${loc.name}] ${currStatus} ` +
            `in=${report.arrival.inMinutes ?? 0}min peak=${report.arrival.peakRateMmH}mm/h`,
        );

        if (
          await trySendPush(
            userKey,
            rainTemplate,
            { msg: buildPushMsg(loc.name, report) },
            loc.name,
            'rain',
          )
        ) {
          result.pushed += 1;
        }
      } catch (e) {
        console.error(`[NOTIFY] ${loc.name}`, e);
      }
    }
  }

  if (relayDirty) {
    await saveRelayPhases(relayPhases);
  }

  return result;
}
