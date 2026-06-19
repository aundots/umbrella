import type { NotifyCampaign, NotifyCampaignKind, NotifyCampaignStore } from '../db/persistence.js';
import {
  loadNotifyCampaigns,
  notifyCampaignKey,
  saveNotifyCampaigns,
} from '../db/persistence.js';

/** Unacked reminders — every 10 minutes until user opens the app or event ends. */
export const REMIND_INTERVAL_MS = 10 * 60_000;

export type RemindAction = 'first' | 'remind' | 'skip';

export function planRemind(campaign: NotifyCampaign | undefined): RemindAction {
  if (!campaign) return 'first';
  if (campaign.ackedAt != null) return 'skip';
  if (campaign.sendCount === 0) return 'first';
  if (Date.now() - campaign.lastSentAt >= REMIND_INTERVAL_MS) return 'remind';
  return 'skip';
}

export function createCampaign(
  userKey: string,
  locationId: string,
  kind: NotifyCampaignKind,
): NotifyCampaign {
  const now = Date.now();
  return {
    userKey,
    locationId,
    kind,
    startedAt: now,
    lastSentAt: 0,
    ackedAt: null,
    sendCount: 0,
  };
}

export function markCampaignSent(campaign: NotifyCampaign): void {
  campaign.lastSentAt = Date.now();
  campaign.sendCount += 1;
}

export function clearCampaign(
  campaigns: NotifyCampaignStore,
  userKey: string,
  locationId: string,
  kind: NotifyCampaignKind,
): boolean {
  const key = notifyCampaignKey(userKey, locationId, kind);
  if (!(key in campaigns)) return false;
  delete campaigns[key];
  return true;
}

export async function ackNotifyCampaigns(
  campaigns: NotifyCampaignStore,
  userKey: string,
  locationId?: string,
): Promise<number> {
  const now = Date.now();
  let count = 0;
  for (const campaign of Object.values(campaigns)) {
    if (campaign.userKey !== userKey) continue;
    if (locationId && campaign.locationId !== locationId) continue;
    if (campaign.ackedAt != null) continue;
    campaign.ackedAt = now;
    count += 1;
  }
  return count;
}

export async function ackUserNotifyCampaigns(
  userKey: string,
  locationId?: string,
): Promise<number> {
  const campaigns = await loadNotifyCampaigns();
  const count = await ackNotifyCampaigns(campaigns, userKey, locationId);
  if (count > 0) await saveNotifyCampaigns(campaigns);
  return count;
}
