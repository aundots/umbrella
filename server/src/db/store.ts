import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

export interface SavedLocation {
  id: string;
  userKey: string;
  name: string;
  lat: number;
  lng: number;
  notifyEnabled: boolean;
  notifyBeforeMin: 30 | 60;
  isCurrent?: boolean;
}

export interface UserRecord {
  userKey: string;
  notifyConsent: boolean;
  createdAt: string;
}

interface DbData {
  users: UserRecord[];
  locations: SavedLocation[];
}

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dir, '../../data/db.json');

function load(): DbData {
  if (!existsSync(DATA_PATH)) {
    return { users: [], locations: [] };
  }
  return JSON.parse(readFileSync(DATA_PATH, 'utf-8')) as DbData;
}

function save(data: DbData): void {
  mkdirSync(dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

export function upsertUser(userKey: string, notifyConsent: boolean): UserRecord {
  const db = load();
  let user = db.users.find((u) => u.userKey === userKey);
  if (!user) {
    user = { userKey, notifyConsent, createdAt: new Date().toISOString() };
    db.users.push(user);
  } else {
    user.notifyConsent = notifyConsent;
  }
  save(db);
  return user;
}

export function listLocations(userKey: string): SavedLocation[] {
  return load().locations.filter((l) => l.userKey === userKey);
}

export function addLocation(
  userKey: string,
  input: Omit<SavedLocation, 'id' | 'userKey'>,
): SavedLocation {
  const db = load();
  const loc: SavedLocation = { ...input, id: randomUUID(), userKey };
  db.locations.push(loc);
  save(db);
  return loc;
}

export function updateLocation(
  userKey: string,
  id: string,
  patch: Partial<SavedLocation>,
): SavedLocation | null {
  const db = load();
  const idx = db.locations.findIndex((l) => l.id === id && l.userKey === userKey);
  if (idx < 0) return null;
  db.locations[idx] = { ...db.locations[idx], ...patch };
  save(db);
  return db.locations[idx];
}

export function deleteLocation(userKey: string, id: string): boolean {
  const db = load();
  const before = db.locations.length;
  db.locations = db.locations.filter((l) => !(l.id === id && l.userKey === userKey));
  save(db);
  return db.locations.length < before;
}

export function getLocation(userKey: string, id: string): SavedLocation | null {
  return load().locations.find((l) => l.id === id && l.userKey === userKey) ?? null;
}

export function deleteUserData(userKey: string): void {
  const db = load();
  db.users = db.users.filter((u) => u.userKey !== userKey);
  db.locations = db.locations.filter((l) => l.userKey !== userKey);
  save(db);
}
