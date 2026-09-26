import { randomUUID } from 'crypto';
import { loadDb, saveDb, type DbData } from './persistence.js';

export interface SavedLocation {
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

export interface UserRecord {
  userKey: string;
  notifyConsent: boolean;
  createdAt: string;
}

async function withDb<T>(fn: (db: DbData) => T | Promise<T>): Promise<T> {
  const db = await loadDb();
  const result = await fn(db);
  return result;
}

async function mutateDb(fn: (db: DbData) => void): Promise<DbData> {
  const db = await loadDb();
  fn(db);
  await saveDb(db);
  return db;
}

export async function upsertUser(userKey: string, notifyConsent: boolean): Promise<UserRecord> {
  let user!: UserRecord;
  await mutateDb((db) => {
    const found = db.users.find((u) => u.userKey === userKey);
    if (!found) {
      user = { userKey, notifyConsent, createdAt: new Date().toISOString() };
      db.users.push(user);
    } else {
      found.notifyConsent = notifyConsent;
      user = found;
    }
  });
  return user;
}

export async function listLocations(userKey: string): Promise<SavedLocation[]> {
  return withDb((db) =>
    db.locations.filter((l) => l.userKey === userKey && !l.isCurrent),
  );
}

export async function upsertCurrentLocation(
  userKey: string,
  input: {
    lat: number;
    lng: number;
    address?: string;
    notifyEnabled: boolean;
    notifyBeforeMin: 30 | 60;
  },
): Promise<SavedLocation> {
  let loc!: SavedLocation;
  await mutateDb((db) => {
    const idx = db.locations.findIndex((l) => l.userKey === userKey && l.isCurrent);
    const next: SavedLocation = {
      id: '__current__',
      userKey,
      name: '현재 위치',
      lat: input.lat,
      lng: input.lng,
      ...(input.address?.trim() ? { address: input.address.trim() } : {}),
      notifyEnabled: input.notifyEnabled,
      notifyBeforeMin: input.notifyBeforeMin,
      isCurrent: true,
    };
    if (idx >= 0) {
      db.locations[idx] = { ...db.locations[idx], ...next };
      loc = db.locations[idx];
    } else {
      loc = next;
      db.locations.push(loc);
    }
  });
  return loc;
}

export async function addLocation(
  userKey: string,
  input: Omit<SavedLocation, 'id' | 'userKey'>,
): Promise<SavedLocation> {
  const loc: SavedLocation = { ...input, id: randomUUID(), userKey };
  await mutateDb((db) => {
    db.locations.push(loc);
  });
  return loc;
}

export async function updateLocation(
  userKey: string,
  id: string,
  patch: Partial<SavedLocation>,
): Promise<SavedLocation | null> {
  let updated: SavedLocation | null = null;
  await mutateDb((db) => {
    const idx = db.locations.findIndex((l) => l.id === id && l.userKey === userKey);
    if (idx < 0) return;
    db.locations[idx] = { ...db.locations[idx], ...patch };
    updated = db.locations[idx];
  });
  return updated;
}

export async function deleteLocation(userKey: string, id: string): Promise<boolean> {
  let removed = false;
  await mutateDb((db) => {
    const before = db.locations.length;
    db.locations = db.locations.filter((l) => !(l.id === id && l.userKey === userKey));
    removed = db.locations.length < before;
  });
  return removed;
}

export async function getLocation(userKey: string, id: string): Promise<SavedLocation | null> {
  return withDb((db) => db.locations.find((l) => l.id === id && l.userKey === userKey) ?? null);
}

export async function deleteUserData(userKey: string): Promise<void> {
  await mutateDb((db) => {
    db.users = db.users.filter((u) => u.userKey !== userKey);
    db.locations = db.locations.filter((l) => l.userKey !== userKey);
  });
}

export async function listNotifyTargets(): Promise<
  Array<{ userKey: string; locations: SavedLocation[] }>
> {
  const db = await loadDb();
  const consentUsers = new Set(
    db.users.filter((u) => u.notifyConsent).map((u) => u.userKey),
  );
  const byUser = new Map<string, SavedLocation[]>();

  for (const loc of db.locations) {
    if (!loc.notifyEnabled) continue;
    if (!consentUsers.has(loc.userKey)) continue;
    const list = byUser.get(loc.userKey) ?? [];
    list.push(loc);
    byUser.set(loc.userKey, list);
  }

  return [...byUser.entries()].map(([userKey, locations]) => ({ userKey, locations }));
}
