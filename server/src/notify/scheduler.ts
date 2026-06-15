import { listNotifyTargets, type SavedLocation } from '../db/store.js';
import { loadRelayPhases, saveRelayPhases, type RelayPhase } from '../db/persistence.js';
import { buildLiveRelayReport } from '../engine/liveRelay.js';
import { isMtlsConfigured } from '../toss/mtls.js';
import {
  buildPushMsg,
  buildPushMsgCancel,
  buildPushMsgClear,
  buildPushMsgEndSoon,
  sendFunctionalMessage,
} from '../toss/messenger.js';

type NotifyKind = 'rain' | 'sudden' | 'clear' | 'end_soon' | 'cancel';

const COOLDOWN_BY_KIND: Record<NotifyKind, number> = {
  rain: 30 * 60_000,
  sudden: 15 * 60_000,
  clear: 30 * 60_000,
  end_soon: 30 * 60_000,
  cancel: 30 * 60_000,
};

const END_SOON_LEAD_MIN = 30;

const sentByKind = new Map<NotifyKind, Map<string, number>>();

export interface NotifyScanResult {
  users: number;
  locations: number;
  triggered: number;
  pushed: number;
  sudden: number;
  endSoon: number;
  cleared: number;
  cancelled: number;
  skippedCooldown: number;
  errors: number;
  durationMs: number;
}

interface LocationScanDelta {
  relayDirty: boolean;
  triggered: number;
  pushed: number;
  sudden: number;
  endSoon: number;
  cleared: number;
  cancelled: number;
  skippedCooldown: number;
  errored: boolean;
}

function isTossUserKey(userKey: string): boolean {
  return /^\d+$/.test(userKey);
}

function getSentMap(kind: NotifyKind): Map<string, number> {
  let map = sentByKind.get(kind);
  if (!map) {
    map = new Map();
    sentByKind.set(kind, map);
  }
  return map;
}

function withinCooldown(kind: NotifyKind, eventKey: string): boolean {
  const map = getSentMap(kind);
  return Date.now() - (map.get(eventKey) ?? 0) < COOLDOWN_BY_KIND[kind];
}

function markSent(kind: NotifyKind, eventKey: string): void {
  getSentMap(kind).set(eventKey, Date.now());
}

async function trySendPush(
  userKey: string,
  templateCode: string,
  context: Record<string, string>,
  locName: string,
  kind: NotifyKind,
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

async function scanLocation(
  userKey: string,
  loc: SavedLocation,
  rainTemplate: string | undefined,
  clearTemplate: string | undefined,
  endSoonTemplate: string | undefined,
  cancelTemplate: string | undefined,
  relayPhases: Record<string, RelayPhase>,
): Promise<LocationScanDelta> {
  const delta: LocationScanDelta = {
    relayDirty: false,
    triggered: 0,
    pushed: 0,
    sudden: 0,
    endSoon: 0,
    cleared: 0,
    cancelled: 0,
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

    let rainHandled = false;

    // 1) 갑작스러운 비: clear → live (짧은 쿨다운, 우선 발송)
    if (prevStatus === 'clear' && currStatus === 'live' && rainTemplate) {
      const eventKey = `${stateKey}:sudden`;
      if (withinCooldown('sudden', eventKey)) {
        delta.skippedCooldown += 1;
        rainHandled = true;
      } else {
        markSent('sudden', eventKey);
        markSent('rain', `${stateKey}:live:now`);
        delta.triggered += 1;
        console.log(`[NOTIFY] user=${userKey} [${loc.name}] sudden_rain`);
        if (
          await trySendPush(
            userKey,
            rainTemplate,
            { msg: buildPushMsg(loc.name, report) },
            loc.name,
            'sudden',
          )
        ) {
          delta.sudden += 1;
          delta.pushed += 1;
          rainHandled = true;
        }
      }
    }

    // 2) 예보 취소: approaching → clear
    if (prevStatus === 'approaching' && currStatus === 'clear' && cancelTemplate) {
      const eventKey = `${stateKey}:cancel`;
      if (withinCooldown('cancel', eventKey)) {
        delta.skippedCooldown += 1;
      } else {
        markSent('cancel', eventKey);
        delta.triggered += 1;
        console.log(`[NOTIFY] user=${userKey} [${loc.name}] forecast_cancel`);
        if (
          await trySendPush(
            userKey,
            cancelTemplate,
            { msg: buildPushMsgCancel(loc.name) },
            loc.name,
            'cancel',
          )
        ) {
          delta.cancelled += 1;
        }
      }
    }

    // 3) 비 그침: live → clear
    if (prevStatus === 'live' && currStatus === 'clear' && clearTemplate) {
      const eventKey = `${stateKey}:clear`;
      if (withinCooldown('clear', eventKey)) {
        delta.skippedCooldown += 1;
      } else {
        markSent('clear', eventKey);
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

    // 4) 곧 그침
    const remainingMin = report.end.remainingMinutes;
    const shouldNotifyEndSoon =
      report.end.soon &&
      report.now.precipitating &&
      remainingMin != null &&
      remainingMin > 0 &&
      remainingMin <= END_SOON_LEAD_MIN &&
      endSoonTemplate;

    if (shouldNotifyEndSoon) {
      const endKey = report.end.at?.slice(0, 16) ?? String(remainingMin);
      const eventKey = `${stateKey}:end_soon:${endKey}`;
      if (withinCooldown('end_soon', eventKey)) {
        delta.skippedCooldown += 1;
      } else {
        markSent('end_soon', eventKey);
        delta.triggered += 1;
        console.log(
          `[NOTIFY] user=${userKey} [${loc.name}] end_soon in=${remainingMin}min`,
        );
        if (
          await trySendPush(
            userKey,
            endSoonTemplate,
            { msg: buildPushMsgEndSoon(loc.name, remainingMin) },
            loc.name,
            'end_soon',
          )
        ) {
          delta.endSoon += 1;
        }
      }
    }

    // 5) 강수 예고 / 도착 (갑작스러운 비는 위에서 처리)
    const shouldNotifyRain =
      !rainHandled &&
      (report.now.precipitating ||
        (report.arrival.willArrive &&
          report.arrival.inMinutes != null &&
          report.arrival.inMinutes <= loc.notifyBeforeMin));

    if (!shouldNotifyRain || !rainTemplate) return delta;

    const rainEventKey = report.now.precipitating
      ? `${stateKey}:live:now`
      : `${stateKey}:approaching:${report.arrival.inMinutes}`;

    if (withinCooldown('rain', rainEventKey)) {
      delta.skippedCooldown += 1;
      return delta;
    }

    markSent('rain', rainEventKey);
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
  const endSoonTemplate = process.env.TOSS_PUSH_TEMPLATE_CODE_END_SOON?.trim();
  const cancelTemplate = process.env.TOSS_PUSH_TEMPLATE_CODE_CANCEL?.trim();

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
      scanLocation(
        userKey,
        loc,
        rainTemplate,
        clearTemplate,
        endSoonTemplate,
        cancelTemplate,
        relayPhases,
      ),
    ),
  );

  const result: NotifyScanResult = {
    users: targets.length,
    locations: jobs.length,
    triggered: 0,
    pushed: 0,
    sudden: 0,
    endSoon: 0,
    cleared: 0,
    cancelled: 0,
    skippedCooldown: 0,
    errors: 0,
    durationMs: 0,
  };

  let relayDirty = false;
  for (const delta of deltas) {
    result.triggered += delta.triggered;
    result.pushed += delta.pushed;
    result.sudden += delta.sudden;
    result.endSoon += delta.endSoon;
    result.cleared += delta.cleared;
    result.cancelled += delta.cancelled;
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
