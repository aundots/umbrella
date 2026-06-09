import { listNotifyTargets } from '../db/store.js';
import { loadRelayPhases, saveRelayPhases, type RelayPhase } from '../db/persistence.js';
import { buildLiveRelayReport } from '../engine/liveRelay.js';
import { isMtlsConfigured } from '../toss/mtls.js';
import {
  buildPushMsg,
  buildPushMsgClear,
  sendFunctionalMessage,
} from '../toss/messenger.js';
import type { SavedLocation } from '../db/store.js';

const sent = new Map<string, number>();
const COOLDOWN_MS = 30 * 60 * 1000;

export interface NotifyScanResult {
  users: number;
  locations: number;
  triggered: number;
  pushed: number;
  cleared: number;
  skippedCooldown: number;
  errors: number;
  durationMs: number;
}

interface LocationScanDelta {
  relayDirty: boolean;
  triggered: number;
  pushed: number;
  cleared: number;
  skippedCooldown: number;
  errored: boolean;
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

async function scanLocation(
  userKey: string,
  loc: SavedLocation,
  rainTemplate: string | undefined,
  clearTemplate: string | undefined,
  relayPhases: Record<string, RelayPhase>,
): Promise<LocationScanDelta> {
  const delta: LocationScanDelta = {
    relayDirty: false,
    triggered: 0,
    pushed: 0,
    cleared: 0,
    skippedCooldown: 0,
    errored: false,
  };

  try {
    const report = await buildLiveRelayReport(
      {
        locationId: loc.id,
        locationName: loc.name,
        lat: loc.lat,
        lng: loc.lng,
      },
      { skipDetail: true },
    );

    const stateKey = `${userKey}:${loc.id}`;
    const prevStatus = relayPhases[stateKey];
    const currStatus = report.relayStatus as RelayPhase;
    if (prevStatus !== currStatus) {
      relayPhases[stateKey] = currStatus;
      delta.relayDirty = true;
    }

    if (prevStatus === 'live' && currStatus === 'clear' && clearTemplate) {
      const eventKey = `${stateKey}:clear`;
      if (withinCooldown(eventKey)) {
        delta.skippedCooldown += 1;
      } else {
        markSent(eventKey);
        delta.triggered += 1;
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
          delta.cleared += 1;
        }
      }
    }

    const shouldNotifyRain =
      report.now.precipitating ||
      (report.arrival.willArrive &&
        report.arrival.inMinutes != null &&
        report.arrival.inMinutes <= loc.notifyBeforeMin);

    if (!shouldNotifyRain || !rainTemplate) return delta;

    const eventKey = `${stateKey}:${currStatus}:${report.arrival.inMinutes ?? 'now'}`;
    if (withinCooldown(eventKey)) {
      delta.skippedCooldown += 1;
      return delta;
    }

    markSent(eventKey);
    delta.triggered += 1;
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
      delta.pushed += 1;
    }
  } catch (e) {
    delta.errored = true;
    console.error(`[NOTIFY] ${loc.name}`, e);
  }

  return delta;
}

export async function runNotifyScan(): Promise<NotifyScanResult> {
  const started = Date.now();
  const rainTemplate = process.env.TOSS_PUSH_TEMPLATE_CODE?.trim();
  const clearTemplate = process.env.TOSS_PUSH_TEMPLATE_CODE_CLEAR?.trim();

  const targets = await listNotifyTargets();
  const relayPhases = await loadRelayPhases();

  const jobs: Array<{ userKey: string; loc: SavedLocation }> = [];
  for (const { userKey, locations } of targets) {
    for (const loc of locations) {
      jobs.push({ userKey, loc });
    }
  }

  const deltas = await Promise.all(
    jobs.map(({ userKey, loc }) =>
      scanLocation(userKey, loc, rainTemplate, clearTemplate, relayPhases),
    ),
  );

  const result: NotifyScanResult = {
    users: targets.length,
    locations: jobs.length,
    triggered: 0,
    pushed: 0,
    cleared: 0,
    skippedCooldown: 0,
    errors: 0,
    durationMs: 0,
  };

  let relayDirty = false;
  for (const delta of deltas) {
    result.triggered += delta.triggered;
    result.pushed += delta.pushed;
    result.cleared += delta.cleared;
    result.skippedCooldown += delta.skippedCooldown;
    if (delta.errored) result.errors += 1;
    if (delta.relayDirty) relayDirty = true;
  }

  if (relayDirty) {
    await saveRelayPhases(relayPhases);
  }

  result.durationMs = Date.now() - started;
  return result;
}
