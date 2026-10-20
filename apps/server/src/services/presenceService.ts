import { getDatabase } from "@/db/database";
import { users } from "@/db/schema";
import { inArray } from "drizzle-orm";

export type UserPresenceStatus = "online" | "away" | "offline";

export type UserPresence = {
  status: UserPresenceStatus;
  currentPath?: string;
  lastSeenMs: number;
};

type PresenceEntry = {
  lastSeenMs: number;
  currentPath?: string;
  clientIp?: string;
};

const presenceStore = new Map<string, PresenceEntry>();
const onlineThresholdMs = 60_000;
const awayThresholdMs = 300_000;
const cleanupThresholdMs = 600_000;
const passiveThrottleMs = 30_000;

const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of presenceStore) {
    if (now - entry.lastSeenMs > cleanupThresholdMs) {
      presenceStore.delete(userId);
    }
  }
}, 300_000);
cleanupInterval.unref();

export function recordUserPresence(userId: string, options?: { currentPath?: string; clientIp?: string }) {
  const existing = presenceStore.get(userId);
  presenceStore.set(userId, {
    lastSeenMs: Date.now(),
    currentPath: options?.currentPath ?? existing?.currentPath,
    clientIp: options?.clientIp ?? existing?.clientIp,
  });
}

export function recordPassiveUserPresence(userId: string, clientIp?: string) {
  const existing = presenceStore.get(userId);
  const now = Date.now();
  if (existing && now - existing.lastSeenMs < passiveThrottleMs) {
    return;
  }
  presenceStore.set(userId, {
    lastSeenMs: now,
    currentPath: existing?.currentPath,
    clientIp: clientIp ?? existing?.clientIp,
  });
}

export function removeUserPresence(userId: string) {
  presenceStore.delete(userId);
}

export function getUserPresence(userId: string): UserPresence {
  const entry = presenceStore.get(userId);
  if (!entry) return { status: "offline", lastSeenMs: 0 };
  const diff = Date.now() - entry.lastSeenMs;
  if (diff <= onlineThresholdMs) {
    return { status: "online", currentPath: entry.currentPath, lastSeenMs: entry.lastSeenMs };
  }
  if (diff <= awayThresholdMs) {
    return { status: "away", currentPath: entry.currentPath, lastSeenMs: entry.lastSeenMs };
  }
  return { status: "offline", currentPath: entry.currentPath, lastSeenMs: entry.lastSeenMs };
}

export async function getOnlineUsers() {
  const now = Date.now();
  const activeEntries: Array<{ userId: string; status: "online" | "away"; lastSeenMs: number; currentPath?: string; clientIp?: string }> = [];

  for (const [userId, entry] of presenceStore) {
    const diff = now - entry.lastSeenMs;
    if (diff <= onlineThresholdMs) {
      activeEntries.push({ userId, status: "online", lastSeenMs: entry.lastSeenMs, currentPath: entry.currentPath, clientIp: entry.clientIp });
    } else if (diff <= awayThresholdMs) {
      activeEntries.push({ userId, status: "away", lastSeenMs: entry.lastSeenMs, currentPath: entry.currentPath, clientIp: entry.clientIp });
    }
  }

  if (activeEntries.length === 0) {
    return { totalOnline: 0, totalAway: 0, users: [] };
  }

  const userIds = activeEntries.map(item => item.userId);
  const dbUsers = await getDatabase()
    .select({ id: users.id, email: users.email, displayName: users.displayName })
    .from(users)
    .where(inArray(users.id, userIds));

  const userMap = new Map(dbUsers.map(user => [user.id, user]));

  const usersList = activeEntries.map(entry => {
    const user = userMap.get(entry.userId);
    return {
      userId: entry.userId,
      email: user?.email ?? "",
      displayName: user?.displayName ?? "未知用户",
      status: entry.status,
      currentPath: entry.currentPath,
      lastSeenMs: entry.lastSeenMs,
      clientIp: entry.clientIp,
    };
  }).sort((a, b) => b.lastSeenMs - a.lastSeenMs);

  const totalOnline = usersList.filter(u => u.status === "online").length;
  const totalAway = usersList.filter(u => u.status === "away").length;

  return { totalOnline, totalAway, users: usersList };
}
