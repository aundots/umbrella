import { listNotifyTargets, type SavedLocation } from '../db/store.js';
import {
  loadNotifyCampaigns,
  loadRelayPhases,
  notifyCampaignKey,
  saveNotifyCampaigns,
  saveRelayPhases,
  type NotifyCampaignStore,
  type RelayPhase,
  type RelayPhaseEntry,
} from '../db/persistence.js';
import {
  advancePhaseEntry,
  canSendClearNotify,
  canSendRainNotify,
  markClearNotify,
  markRainNotify,
  normalizePhaseEntry,
} from './phaseStability.js';
import { buildLiveRelayReport } from '../engine/liveRelay.js';
import { isMtlsConfigured } from '../toss/mtls.js';
import {
  buildPushMsg,
  buildPushMsgCancel,
  buildPushMsgClear,
  buildPushMsgEndSoon,
  formatDeliveryError,
  parseSendDelivery,
  sendFunctionalMessage,
} from '../toss/messenger.js';
import {
  clearCampaign,
  createCampaign,
  markCampaignSent,
  planRemind,
  type RemindAction,
} from './campaigns.js';
import { isDryForClearNotify } from './dryGate.js';
import { isNotifyPushEnabled } from './pushGate.js';

type NotifyKind = 'rain' | 'sudden' | 'clear' | 'end_soon' | 'cancel';

const COOLDOWN_BY_KIND: Record<NotifyKind, number> = {
  rain: 30 * 60_000,
  sudden: 45 * 60_000,
  clear: 45 * 60_000,
  end_soon: 30 * 60_000,
  cancel: 45 * 60_000,
};

/** @deprecated rain/end_soon use ack + 10min remind campaigns instead */

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
  reminders: number;
  errors: number;
  durationMs: number;
  paused?: boolean;
}

interface LocationScanDelta {
  relayDirty: boolean;
  campaignsDirty: boolean;
  triggered: number;
  pushed: number;
  sudden: number;
  endSoon: number;
  cleared: number;
  cancelled: number;
  skippedCooldown: number;
  reminders: number;
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
  if (!isNotifyPushEnabled()) return false;
  if (!isMtlsConfigured() || !isTossUserKey(userKey)) return false;

  const { status, data } = await sendFunctionalMessage({
    userKey,
    templateSetCode: templateCode,
    context,
  });

  const delivery = parseSendDelivery(data);
  if (delivery.delivered) {
    console.log(`[NOTIFY] ${kind} push sent user=${userKey} loc=${locName} push=${delivery.sentPushCount}`);
    return true;
  }

  const hint = formatDeliveryError(delivery) ?? data.error?.reason ?? 'unknown';
  console.warn(`[NOTIFY] ${kind} push not delivered user=${userKey} status=${status}`, hint);
  return false;
}

async function tickRemindCampaign(
  campaigns: NotifyCampaignStore,
  userKey: string,
  loc: SavedLocation,
  kind: 'approaching' | 'end_soon',
  active: boolean,
  template: string | undefined,
  buildContext: () => Record<string, string>,
  logLabel: string,
  notifyKind: NotifyKind,
  delta: LocationScanDelta,
  phaseEntry?: RelayPhaseEntry,
): Promise<boolean> {
  let dirty = false;

  if (!active || !template) {
    return clearCampaign(campaigns, userKey, loc.id, kind);
  }

  const key = notifyCampaignKey(userKey, loc.id, kind);
  const action: RemindAction = planRemind(campaigns[key]);
  if (action === 'skip') return false;

  if (action === 'first' && !campaigns[key]) {
    campaigns[key] = createCampaign(userKey, loc.id, kind);
    dirty = true;
  }

  const campaign = campaigns[key];
  delta.triggered += 1;
  if (action === 'remind') delta.reminders += 1;

  console.log(
    `[NOTIFY] user=${userKey} [${loc.name}] ${logLabel}` +
      (action === 'remind' ? ' remind' : ''),
  );

  if (kind === 'approaching' && phaseEntry && !canSendRainNotify(phaseEntry)) {
    return dirty;
  }

  if (
    await trySendPush(userKey, template, buildContext(), loc.name, notifyKind)
  ) {
    markCampaignSent(campaign);
    delta.pushed += 1;
    if (kind === 'end_soon') delta.endSoon += 1;
    if (kind === 'approaching' && phaseEntry && canSendRainNotify(phaseEntry)) {
      markRainNotify(phaseEntry);
    }
    dirty = true;
  }

  return dirty;
}

async function scanLocation(
  userKey: string,
  loc: SavedLocation,
  rainTemplate: string | undefined,
  clearTemplate: string | undefined,
  endSoonTemplate: string | undefined,
  cancelTemplate: string | undefined,
  relayPhases: Record<string, RelayPhase | RelayPhaseEntry>,
  campaigns: NotifyCampaignStore,
): Promise<LocationScanDelta> {
  const delta: LocationScanDelta = {
    relayDirty: false,
    campaignsDirty: false,
    triggered: 0,
    pushed: 0,
    sudden: 0,
    endSoon: 0,
    cleared: 0,
    cancelled: 0,
    skippedCooldown: 0,
    reminders: 0,
    errored: false,
  };

  let campaignsDirty = false;

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
    const phase = advancePhaseEntry(relayPhases[stateKey], report.relayStatus as RelayPhase);
    if (phase.dirty) {
      relayPhases[stateKey] = phase.entry;
      delta.relayDirty = true;
    }

    const prevStatus = phase.prevConfirmed;
    const currStatus = phase.confirmed;
    const statusChanged = phase.transitioned;

    let rainHandled = false;

    // 1) 갑작스러운 비: clear → live (확정 전이 + 상호 쿨다운)
    if (
      statusChanged &&
      prevStatus === 'clear' &&
      currStatus === 'live' &&
      rainTemplate &&
      canSendRainNotify(phase.entry)
    ) {
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
          markRainNotify(phase.entry);
          delta.relayDirty = true;
          if (clearCampaign(campaigns, userKey, loc.id, 'approaching')) campaignsDirty = true;
        }
      }
    }

    // 2) 예보 취소: approaching → clear (확정 전이)
    if (statusChanged && prevStatus === 'approaching' && currStatus === 'clear' && cancelTemplate) {
      if (clearCampaign(campaigns, userKey, loc.id, 'approaching')) campaignsDirty = true;

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

    // 3) 비 그침: live → clear (확정 전이 + 다중 소스 건조 확인 + 상호 쿨다운)
    if (
      statusChanged &&
      prevStatus === 'live' &&
      currStatus === 'clear' &&
      clearTemplate &&
      canSendClearNotify(phase.entry) &&
      isDryForClearNotify(report)
    ) {
      if (clearCampaign(campaigns, userKey, loc.id, 'end_soon')) campaignsDirty = true;

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
          delta.pushed += 1;
          markClearNotify(phase.entry);
          delta.relayDirty = true;
        }
      }
    }

    // 4) 곧 그침 — 확인 전 10분마다 재발송 (확정 live 일 때만)
    const remainingMin = report.end.remainingMinutes;
    const shouldNotifyEndSoon =
      currStatus === 'live' &&
      report.end.soon &&
      report.now.precipitating &&
      remainingMin != null &&
      remainingMin > 0 &&
      remainingMin <= END_SOON_LEAD_MIN;

    if (
      await tickRemindCampaign(
        campaigns,
        userKey,
        loc,
        'end_soon',
        Boolean(shouldNotifyEndSoon),
        endSoonTemplate,
        () => ({ msg: buildPushMsgEndSoon(loc.name, remainingMin ?? 0) }),
        `end_soon in=${remainingMin ?? '?'}min`,
        'end_soon',
        delta,
      )
    ) {
      campaignsDirty = true;
    }

    if (currStatus === 'clear' || !report.now.precipitating) {
      if (clearCampaign(campaigns, userKey, loc.id, 'end_soon')) campaignsDirty = true;
    }

    // 5) 강수 예고 — 확정 approaching 일 때만, 확인 전 10분마다 재발송
    const shouldNotifyApproaching =
      currStatus === 'approaching' &&
      !rainHandled &&
      !report.now.precipitating &&
      report.arrival.willArrive &&
      report.arrival.inMinutes != null &&
      report.arrival.inMinutes <= loc.notifyBeforeMin;

    if (
      await tickRemindCampaign(
        campaigns,
        userKey,
        loc,
        'approaching',
        Boolean(shouldNotifyApproaching),
        rainTemplate,
        () => ({ msg: buildPushMsg(loc.name, report) }),
        `approaching in=${report.arrival.inMinutes ?? '?'}min peak=${report.arrival.peakRateMmH}mm/h`,
        'rain',
        delta,
        phase.entry,
      )
    ) {
      campaignsDirty = true;
    }

    if (currStatus === 'live' || report.now.precipitating) {
      if (clearCampaign(campaigns, userKey, loc.id, 'approaching')) campaignsDirty = true;
    }
  } catch (e) {
    delta.errored = true;
    console.error(`[NOTIFY] ${loc.name}`, e);
  }

  delta.campaignsDirty = campaignsDirty;
  return delta;
}

export async function runNotifyScan(): Promise<NotifyScanResult> {
  const started = Date.now();
  if (!isNotifyPushEnabled()) {
    return {
      users: 0,
      locations: 0,
      triggered: 0,
      pushed: 0,
      sudden: 0,
      endSoon: 0,
      cleared: 0,
      cancelled: 0,
      skippedCooldown: 0,
      reminders: 0,
      errors: 0,
      durationMs: Date.now() - started,
      paused: true,
    };
  }

  const rainTemplate = process.env.TOSS_PUSH_TEMPLATE_CODE?.trim();
  const clearTemplate = process.env.TOSS_PUSH_TEMPLATE_CODE_CLEAR?.trim();
  const endSoonTemplate = process.env.TOSS_PUSH_TEMPLATE_CODE_END_SOON?.trim();
  const cancelTemplate = process.env.TOSS_PUSH_TEMPLATE_CODE_CANCEL?.trim();

  const targets = await listNotifyTargets();
  const relayPhases = await loadRelayPhases();
  const campaigns = await loadNotifyCampaigns();

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
        campaigns,
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
    reminders: 0,
    errors: 0,
    durationMs: 0,
  };

  let relayDirty = false;
  let campaignsDirty = false;
  for (const delta of deltas) {
    result.triggered += delta.triggered;
    result.pushed += delta.pushed;
    result.sudden += delta.sudden;
    result.endSoon += delta.endSoon;
    result.cleared += delta.cleared;
    result.cancelled += delta.cancelled;
    result.skippedCooldown += delta.skippedCooldown;
    result.reminders += delta.reminders;
    if (delta.errored) result.errors += 1;
    if (delta.relayDirty) relayDirty = true;
    if (delta.campaignsDirty) campaignsDirty = true;
  }

  if (relayDirty) {
    await saveRelayPhases(relayPhases);
  }

  if (campaignsDirty) {
    await saveNotifyCampaigns(campaigns);
  }

  result.durationMs = Date.now() - started;
  return result;
}
