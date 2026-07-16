import { Redis } from '@upstash/redis';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

export type RelayPhase = 'live' | 'approaching' | 'clear';

/** 알림용 확정 상태 + 안정화 메타 (레이더/초단기 노이즈 완화) */
export interface RelayPhaseEntry {
  confirmed: RelayPhase;
  pending?: RelayPhase;
  pendingSince?: number;
  lastRainNotifyAt?: number;
  lastClearNotifyAt?: number;
}

export type NotifyCampaignKind = 'approaching' | 'end_soon';

/** Active alert thread — repeat every 10 min until user acks or weather event ends. */
export interface NotifyCampaign {
  userKey: string;
  locationId: string;
  kind: NotifyCampaignKind;
  startedAt: number;
  lastSentAt: number;
  ackedAt: number | null;
  sendCount: number;
}

export type NotifyCampaignStore = Record<string, NotifyCampaign>;

export interface DbUser {
  userKey: string;
  notifyConsent: boolean;
  createdAt: string;
}

export interface DbLocation {
  id: string;
  userKey: string;
  name: string;
  lat: number;
  lng: number;
  address?: string;
  notifyEnabled: boolean;
  notifyBeforeMin: 30 | 60;
  isCurrent?: boolean;
}

export interface DbData {
  users: DbUser[];
  locations: DbLocation[];
}

const DB_KEY = 'umbrella:db';
const RELAY_KEY = 'umbrella:relay';
const NOTIFY_CAMPAIGNS_KEY = 'umbrella:notify-campaigns';

const __dir = dirname(fileURLToPath(import.meta.url));
const LOCAL_DATA_PATH = join(__dir, '../../data/db.json');
const LOCAL_RELAY_PATH = join(__dir, '../../data/relay.json');

let redisClient: Redis | null | undefined;
let memoryDb: DbData = { users: [], locations: [] };
let memoryRelay: Record<string, RelayPhase | RelayPhaseEntry> = {};
let memoryCampaigns: NotifyCampaignStore = {};

function emptyDb(): DbData {
  return { users: [], locations: [] };
}

function stripEnvQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function redisConfig(): { url: string; token: string } | null {
  const rawUrl = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const rawToken = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!rawUrl || !rawToken) return null;

  const url = stripEnvQuotes(rawUrl);
  const token = stripEnvQuotes(rawToken);
  if (!url || !token) return null;
  return { url, token };
}

export function persistenceMode(): 'redis' | 'file' {
  return redisConfig() ? 'redis' : 'file';
}

function getRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const cfg = redisConfig();
  if (!cfg) {
    redisClient = null;
    return null;
  }
  redisClient = new Redis({ url: cfg.url, token: cfg.token });
  return redisClient;
}

function readJsonFile<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
}

export async function loadDb(): Promise<DbData> {
  const redis = getRedis();
  if (redis) {
    const data = await redis.get<DbData>(DB_KEY);
    memoryDb = data ?? emptyDb();
    if (!memoryDb.users) memoryDb.users = [];
    if (!memoryDb.locations) memoryDb.locations = [];
    return memoryDb;
  }

  memoryDb = readJsonFile(LOCAL_DATA_PATH, emptyDb());
  if (!memoryDb.users) memoryDb.users = [];
  if (!memoryDb.locations) memoryDb.locations = [];
  return memoryDb;
}

export async function saveDb(data: DbData): Promise<void> {
  memoryDb = data;
  const redis = getRedis();
  if (redis) {
    await redis.set(DB_KEY, data);
    return;
  }
  writeJsonFile(LOCAL_DATA_PATH, data);
}

export async function loadRelayPhases(): Promise<Record<string, RelayPhase | RelayPhaseEntry>> {
  const redis = getRedis();
  if (redis) {
    const data = await redis.get<Record<string, RelayPhase | RelayPhaseEntry>>(RELAY_KEY);
    memoryRelay = data ?? {};
    return memoryRelay;
  }

  memoryRelay = readJsonFile(LOCAL_RELAY_PATH, {});
  return memoryRelay;
}

export async function saveRelayPhases(
  phases: Record<string, RelayPhase | RelayPhaseEntry>,
): Promise<void> {
  memoryRelay = phases;
  const redis = getRedis();
  if (redis) {
    await redis.set(RELAY_KEY, phases);
    return;
  }
  writeJsonFile(LOCAL_RELAY_PATH, phases);
}

const LOCAL_CAMPAIGNS_PATH = join(__dir, '../../data/notify-campaigns.json');

export function notifyCampaignKey(
  userKey: string,
  locationId: string,
  kind: NotifyCampaignKind,
): string {
  return `${userKey}:${locationId}:${kind}`;
}

export async function loadNotifyCampaigns(): Promise<NotifyCampaignStore> {
  const redis = getRedis();
  if (redis) {
    const data = await redis.get<NotifyCampaignStore>(NOTIFY_CAMPAIGNS_KEY);
    memoryCampaigns = data ?? {};
    return memoryCampaigns;
  }

  memoryCampaigns = readJsonFile(LOCAL_CAMPAIGNS_PATH, {});
  return memoryCampaigns;
}

export async function saveNotifyCampaigns(campaigns: NotifyCampaignStore): Promise<void> {
  memoryCampaigns = campaigns;
  const redis = getRedis();
  if (redis) {
    await redis.set(NOTIFY_CAMPAIGNS_KEY, campaigns);
    return;
  }
  writeJsonFile(LOCAL_CAMPAIGNS_PATH, campaigns);
}
