import type { GlobalLeaderboardEntry, RoomSettings } from '../types/game';

const KEYS = {
  PLAYER_ID: 'khabri_player_id_v1',
  PLAYER_NAME: 'khabri_player_name_v1',
  LAST_ROOM: 'khabri_last_room_v1',
  USED_WORDS: 'khabri_used_words_v2',
  LEADERBOARD: 'khabri_leaderboard_v1',
  HOST_SNAPSHOT: 'khabri_host_snapshot_v1',
} as const;

export interface PersistedHostPlayer {
  id: string;
  name: string;
  avatarColor: string;
  isHost: boolean;
  score: number;
  roundsWon: number;
  roundsPlayed: number;
}

export interface PersistedHostSnapshot {
  code: string;
  hostPlayerId: string;
  hostPlayerName: string;
  roundNumber: number;
  settings: RoomSettings;
  players: PersistedHostPlayer[];
  updatedAt: number;
}

export function getOrCreatePlayerId(): string {
  try {
    const existing = localStorage.getItem(KEYS.PLAYER_ID);
    if (existing) return existing;
    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `p_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(KEYS.PLAYER_ID, generated);
    return generated;
  } catch {
    return `p_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function getSavedPlayerName(): string {
  try {
    return localStorage.getItem(KEYS.PLAYER_NAME) ?? '';
  } catch {
    return '';
  }
}

export function savePlayerName(name: string): void {
  try {
    localStorage.setItem(KEYS.PLAYER_NAME, name);
  } catch {
    // Ignore quota/private-mode errors
  }
}

export function getSavedRoomCode(): string {
  try {
    return localStorage.getItem(KEYS.LAST_ROOM) ?? '';
  } catch {
    return '';
  }
}

export function saveRoomCode(code: string | null): void {
  try {
    if (code) localStorage.setItem(KEYS.LAST_ROOM, code);
    else localStorage.removeItem(KEYS.LAST_ROOM);
  } catch {
    // Ignore storage errors
  }
}

/** Persistent non-repeating word history across months of game nights */
export function loadUsedWordIds(): Set<string> {
  try {
    const raw = localStorage.getItem(KEYS.USED_WORDS);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((item): item is string => typeof item === 'string'));
    }
    return new Set();
  } catch {
    return new Set();
  }
}

export function saveUsedWordIds(ids: Set<string>): void {
  try {
    localStorage.setItem(KEYS.USED_WORDS, JSON.stringify(Array.from(ids)));
  } catch {
    // Ignore storage errors
  }
}

export function clearUsedWordIds(): void {
  try {
    localStorage.removeItem(KEYS.USED_WORDS);
  } catch {
    // Ignore storage errors
  }
}

/** All-Time Leaderboard persisted in browser localStorage */
export function loadGlobalLeaderboard(): GlobalLeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(KEYS.LEADERBOARD);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return sortLeaderboard(
      parsed.filter(
        (entry): entry is GlobalLeaderboardEntry =>
          Boolean(entry) && typeof entry.name === 'string' && typeof entry.score === 'number',
      ),
    );
  } catch {
    return [];
  }
}

export function sortLeaderboard(entries: GlobalLeaderboardEntry[]): GlobalLeaderboardEntry[] {
  return [...entries].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.roundsWon !== a.roundsWon) return b.roundsWon - a.roundsWon;
    return a.name.localeCompare(b.name);
  });
}

export function saveGlobalLeaderboard(entries: GlobalLeaderboardEntry[]): void {
  try {
    const sorted = sortLeaderboard(entries).slice(0, 200);
    localStorage.setItem(KEYS.LEADERBOARD, JSON.stringify(sorted));
  } catch {
    // Ignore storage errors
  }
}

export function recordPlayerRoundInLeaderboard(
  playerName: string,
  pointsEarned: number,
  wonRound: boolean,
  wonAsImposter: boolean,
): GlobalLeaderboardEntry[] {
  const key = playerName.trim().toLowerCase();
  const list = loadGlobalLeaderboard();
  if (!key) return list;

  const now = new Date().toISOString();
  const idx = list.findIndex((e) => e.name.toLowerCase() === key);
  if (idx >= 0) {
    const existing = list[idx];
    list[idx] = {
      name: playerName.trim(),
      score: existing.score + pointsEarned,
      roundsPlayed: existing.roundsPlayed + 1,
      roundsWon: existing.roundsWon + (wonRound ? 1 : 0),
      imposterWins: existing.imposterWins + (wonAsImposter ? 1 : 0),
      lastPlayedAt: now,
    };
  } else {
    list.push({
      name: playerName.trim(),
      score: pointsEarned,
      roundsPlayed: 1,
      roundsWon: wonRound ? 1 : 0,
      imposterWins: wonAsImposter ? 1 : 0,
      lastPlayedAt: now,
    });
  }

  const sorted = sortLeaderboard(list);
  saveGlobalLeaderboard(sorted);
  return sorted;
}

/** Merge synced leaderboard updates from host into guest's localStorage */
export function mergeSyncedLeaderboard(incoming: GlobalLeaderboardEntry[]): GlobalLeaderboardEntry[] {
  const local = loadGlobalLeaderboard();
  const byName = new Map<string, GlobalLeaderboardEntry>();

  for (const entry of local) {
    byName.set(entry.name.toLowerCase(), entry);
  }
  for (const entry of incoming) {
    const k = entry.name.toLowerCase();
    const existing = byName.get(k);
    if (!existing || entry.score > existing.score || entry.roundsPlayed > existing.roundsPlayed) {
      byName.set(k, entry);
    }
  }

  const merged = sortLeaderboard(Array.from(byName.values()));
  saveGlobalLeaderboard(merged);
  return merged;
}

export function clearGlobalLeaderboard(): void {
  try {
    localStorage.removeItem(KEYS.LEADERBOARD);
  } catch {
    // Ignore storage errors
  }
}

/** Save & restore Host's active room snapshot in localStorage so page refresh doesn't lose scores */
export function saveHostRoomSnapshot(snapshot: PersistedHostSnapshot | null): void {
  try {
    if (!snapshot) {
      localStorage.removeItem(KEYS.HOST_SNAPSHOT);
      return;
    }
    localStorage.setItem(KEYS.HOST_SNAPSHOT, JSON.stringify(snapshot));
  } catch {
    // Ignore storage errors
  }
}

export function loadHostRoomSnapshot(): PersistedHostSnapshot | null {
  try {
    const raw = localStorage.getItem(KEYS.HOST_SNAPSHOT);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedHostSnapshot;
    // Expire host snapshot after 12 hours
    if (!parsed || typeof parsed.code !== 'string' || Date.now() - parsed.updatedAt > 12 * 60 * 60 * 1000) {
      localStorage.removeItem(KEYS.HOST_SNAPSHOT);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
