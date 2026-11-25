import express from 'express';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { WORD_BANK, WORD_BANK_STATS, getPackPool, pickRandomWord } from './src/data/wordBank.ts';
import type {
  ClientMessage,
  GamePhase,
  GlobalLeaderboardEntry,
  ImposterHintType,
  PlayerRoundScoreDelta,
  PublicPlayer,
  PublicRoomState,
  RoomSettings,
  RoundResult,
  SecretPlayerAssignment,
  ServerMessage,
  VoteBreakdownItem,
  WordEntry,
} from './src/types/game.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Curated distinct avatar hues for dark velvet UI
const AVATAR_COLORS = [
  '#F59E0B',
  '#10B981',
  '#3B82F6',
  '#EC4899',
  '#8B5CF6',
  '#06B6D4',
  '#F97316',
  '#14B8A6',
  '#E11D48',
  '#6366F1',
  '#84CC16',
  '#D97706',
];

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

interface InternalPlayer {
  id: string;
  name: string;
  avatarColor: string;
  isHost: boolean;
  connected: boolean;
  score: number;
  roundsWon: number;
  roundsPlayed: number;
  isReadyToVote: boolean;
  inCurrentRound: boolean;
  ws: WebSocket | null;
}

interface ActiveRound {
  roundNumber: number;
  wordEntry: WordEntry;
  imposterIds: Set<string>;
  hintType: ImposterHintType;
  hintValue: string;
  startingPlayerId: string;
  startingPlayerName: string;
  votes: Map<string, string>; // voterId -> targetId
}

interface GameRoom {
  code: string;
  createdAt: number;
  lastActivityAt: number;
  phase: GamePhase;
  roundNumber: number;
  settings: RoomSettings;
  players: Map<string, InternalPlayer>;
  usedWordIds: Set<string>;
  activeRound: ActiveRound | null;
  lastResult: RoundResult | null;
}

const rooms = new Map<string, GameRoom>();

// Persistent All-Time Leaderboard storage (safe local JSON file)
const DATA_DIR = path.resolve(__dirname, 'data');
const LEADERBOARD_FILE = path.join(DATA_DIR, 'leaderboard.json');

const globalLeaderboard = new Map<string, GlobalLeaderboardEntry>();

function loadLeaderboard(): void {
  try {
    if (fs.existsSync(LEADERBOARD_FILE)) {
      const raw = fs.readFileSync(LEADERBOARD_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as GlobalLeaderboardEntry[];
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (entry && typeof entry.name === 'string') {
            globalLeaderboard.set(entry.name.toLowerCase(), entry);
          }
        }
      }
    }
  } catch {
    // Gracefully start fresh if storage unavailable
  }
}

function saveLeaderboard(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const list = getSortedGlobalLeaderboard();
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(list.slice(0, 200), null, 2), 'utf-8');
  } catch {
    // Ignore read-only filesystem errors
  }
}

function getSortedGlobalLeaderboard(): GlobalLeaderboardEntry[] {
  return Array.from(globalLeaderboard.values()).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.roundsWon !== a.roundsWon) return b.roundsWon - a.roundsWon;
    return a.name.localeCompare(b.name);
  });
}

function recordGlobalScore(playerName: string, pointsEarned: number, wonRound: boolean, wonAsImposter: boolean): void {
  const key = playerName.trim().toLowerCase();
  if (!key) return;
  const existing = globalLeaderboard.get(key);
  const now = new Date().toISOString();
  if (existing) {
    existing.name = playerName.trim();
    existing.score += pointsEarned;
    existing.roundsPlayed += 1;
    if (wonRound) existing.roundsWon += 1;
    if (wonAsImposter) existing.imposterWins += 1;
    existing.lastPlayedAt = now;
  } else {
    globalLeaderboard.set(key, {
      name: playerName.trim(),
      score: pointsEarned,
      roundsWon: wonRound ? 1 : 0,
      roundsPlayed: 1,
      imposterWins: wonAsImposter ? 1 : 0,
      lastPlayedAt: now,
    });
  }
}

loadLeaderboard();

function generateRoomCode(): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += ROOM_CODE_CHARS[crypto.randomInt(0, ROOM_CODE_CHARS.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return crypto.randomBytes(2).toString('hex').toUpperCase();
}

function createRoom(initialSettings?: Partial<RoomSettings>): GameRoom {
  const code = generateRoomCode();
  const room: GameRoom = {
    code,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    phase: 'LOBBY',
    roundNumber: 0,
    settings: {
      wordPack: initialSettings?.wordPack ?? 'mixed',
      hintMode: initialSettings?.hintMode ?? 'either',
      imposterCount: 1,
    },
    players: new Map(),
    usedWordIds: new Set(),
    activeRound: null,
    lastResult: null,
  };
  rooms.set(code, room);
  return room;
}

function sendToSocket(ws: WebSocket | null, payload: ServerMessage): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(payload));
  } catch {
    // Ignore broken pipe
  }
}

function buildPublicRoomState(room: GameRoom, viewerId: string): PublicRoomState {
  const activeVotes = room.activeRound?.votes;
  const players: PublicPlayer[] = Array.from(room.players.values())
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.name.localeCompare(b.name);
    })
    .map((p) => ({
      id: p.id,
      name: p.name,
      avatarColor: p.avatarColor,
      isHost: p.isHost,
      connected: p.connected,
      score: p.score,
      roundsWon: p.roundsWon,
      roundsPlayed: p.roundsPlayed,
      isReadyToVote: p.isReadyToVote,
      hasVoted: activeVotes ? activeVotes.has(p.id) : false,
      inCurrentRound: p.inCurrentRound,
    }));

  const activePlayers = Array.from(room.players.values()).filter((p) => p.inCurrentRound && p.connected);
  const readyCount = activePlayers.filter((p) => p.isReadyToVote).length;
  const votedCount = activeVotes ? activeVotes.size : 0;
  const packPool = getPackPool(room.settings.wordPack);
  const usedInPack = packPool.filter((w) => room.usedWordIds.has(w.id)).length;

  return {
    code: room.code,
    phase: room.phase,
    roundNumber: room.roundNumber,
    settings: room.settings,
    players,
    startingPlayerId: room.activeRound?.startingPlayerId ?? room.lastResult?.startingPlayerId ?? null,
    startingPlayerName: room.activeRound?.startingPlayerName ?? room.lastResult?.startingPlayerName ?? null,
    usedWordCount: usedInPack,
    availableWordCount: Math.max(0, packPool.length - usedInPack),
    totalBankSize: WORD_BANK.length,
    readyCount,
    votedCount,
    myVoteTargetId: activeVotes?.get(viewerId) ?? null,
    lastResult: room.phase === 'RESULTS' ? room.lastResult : null,
  };
}

function buildSecretForPlayer(room: GameRoom, playerId: string): SecretPlayerAssignment | null {
  if (!room.activeRound) return null;
  const player = room.players.get(playerId);
  if (!player || !player.inCurrentRound) return null;

  const isImposter = room.activeRound.imposterIds.has(playerId);
  if (isImposter) {
    // Strictly send ONLY ONE hint (either similar_word OR category), never both and never secretWord!
    return {
      roundNumber: room.activeRound.roundNumber,
      role: 'imposter',
      hintType: room.activeRound.hintType,
      hintValue: room.activeRound.hintValue,
    };
  }

  return {
    roundNumber: room.activeRound.roundNumber,
    role: 'civilian',
    word: room.activeRound.wordEntry.word,
  };
}

function broadcastRoom(room: GameRoom): void {
  room.lastActivityAt = Date.now();
  for (const player of room.players.values()) {
    if (player.ws && player.connected) {
      sendToSocket(player.ws, {
        type: 'room:state',
        state: buildPublicRoomState(room, player.id),
        secret: buildSecretForPlayer(room, player.id),
      });
    }
  }
}

function ensureRoomHasHost(room: GameRoom): void {
  const players = Array.from(room.players.values());
  const activeHost = players.find((p) => p.isHost && p.connected);
  if (activeHost) return;

  for (const p of players) p.isHost = false;
  const nextHost = players.find((p) => p.connected) ?? players[0];
  if (nextHost) {
    nextHost.isHost = true;
  }
}

function startNewRound(room: GameRoom): string | null {
  const connectedPlayers = Array.from(room.players.values()).filter((p) => p.connected);
  if (connectedPlayers.length < 3) {
    return 'At least 3 connected players are required to start a round.';
  }

  // Pick a random non-repeating word from the selected pack
  const { entry, wrappedAround } = pickRandomWord(room.settings.wordPack, room.usedWordIds);
  if (wrappedAround) {
    const packPool = getPackPool(room.settings.wordPack);
    for (const w of packPool) room.usedWordIds.delete(w.id);
  }
  room.usedWordIds.add(entry.id);

  // Determine imposter count safely (max 2 only if 6+ players)
  const requestedImposters = room.settings.imposterCount;
  const actualImposterCount = connectedPlayers.length >= 6 && requestedImposters === 2 ? 2 : 1;

  // Cryptographically fair Fisher-Yates shuffle to select imposter(s)
  const shuffled = [...connectedPlayers];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    const tmp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = tmp;
  }
  const imposterIds = new Set(shuffled.slice(0, actualImposterCount).map((p) => p.id));

  // Strictly pick EITHER similar_word OR category for the imposter
  let hintType: ImposterHintType;
  if (room.settings.hintMode === 'similar_word') {
    hintType = 'similar_word';
  } else if (room.settings.hintMode === 'category') {
    hintType = 'category';
  } else {
    hintType = crypto.randomInt(0, 2) === 0 ? 'similar_word' : 'category';
  }
  const hintValue = hintType === 'similar_word' ? entry.similarWord : entry.category;

  // Randomly pick ONE person who will start the physical in-person discussion
  const starter = connectedPlayers[crypto.randomInt(0, connectedPlayers.length)];

  room.roundNumber += 1;
  room.phase = 'PLAYING';
  room.lastResult = null;

  for (const p of room.players.values()) {
    p.isReadyToVote = false;
    p.inCurrentRound = p.connected;
  }

  room.activeRound = {
    roundNumber: room.roundNumber,
    wordEntry: entry,
    imposterIds,
    hintType,
    hintValue,
    startingPlayerId: starter.id,
    startingPlayerName: starter.name,
    votes: new Map(),
  };

  broadcastRoom(room);
  return null;
}

function finalizeVoting(room: GameRoom): void {
  if (!room.activeRound || room.phase !== 'VOTING') return;

  const round = room.activeRound;
  const roundPlayers = Array.from(room.players.values()).filter((p) => p.inCurrentRound);

  // Tally votes
  const voteCounts: Record<string, number> = {};
  for (const p of roundPlayers) {
    voteCounts[p.id] = 0;
  }

  const voteBreakdown: VoteBreakdownItem[] = [];
  for (const [voterId, targetId] of round.votes.entries()) {
    const voter = room.players.get(voterId);
    const target = room.players.get(targetId);
    if (!voter || !target) continue;
    voteCounts[targetId] = (voteCounts[targetId] ?? 0) + 1;
    voteBreakdown.push({
      voterId,
      voterName: voter.name,
      targetId,
      targetName: target.name,
      votedForImposter: round.imposterIds.has(targetId),
    });
  }

  // Determine most-voted player (check for tie at the top)
  let maxVotes = 0;
  let topPlayerIds: string[] = [];
  for (const [pid, count] of Object.entries(voteCounts)) {
    if (count > maxVotes) {
      maxVotes = count;
      topPlayerIds = [pid];
    } else if (count === maxVotes && count > 0) {
      topPlayerIds.push(pid);
    }
  }

  const isTieOrNoVotes = maxVotes === 0 || topPlayerIds.length !== 1;
  const mostVotedPlayerId = !isTieOrNoVotes ? topPlayerIds[0] : null;
  const mostVotedPlayer = mostVotedPlayerId ? room.players.get(mostVotedPlayerId) ?? null : null;
  const caughtImposter = Boolean(mostVotedPlayerId && round.imposterIds.has(mostVotedPlayerId));

  const outcome: RoundResult['outcome'] = caughtImposter
    ? 'imposter_caught'
    : isTieOrNoVotes
      ? 'tie_escaped'
      : 'imposter_escaped';

  // Award leaderboard points
  const scoreDeltas: PlayerRoundScoreDelta[] = [];
  for (const p of roundPlayers) {
    const isImposter = round.imposterIds.has(p.id);
    const votedTarget = round.votes.get(p.id);
    const votedCorrectly = Boolean(votedTarget && round.imposterIds.has(votedTarget));

    let pointsEarned = 0;
    let reason = '';
    let wonRound = false;
    let wonAsImposter = false;

    if (caughtImposter) {
      if (isImposter) {
        pointsEarned = 0;
        reason = 'Caught by the room';
      } else if (votedCorrectly) {
        pointsEarned = 100;
        reason = 'Spotted & voted out the imposter';
        wonRound = true;
      } else {
        pointsEarned = 40;
        reason = 'Room caught the imposter';
        wonRound = true;
      }
    } else {
      if (isImposter) {
        pointsEarned = 150;
        reason = isTieOrNoVotes ? 'Survived via split vote' : 'Fooled the room';
        wonRound = true;
        wonAsImposter = true;
      } else if (votedCorrectly) {
        pointsEarned = 25;
        reason = 'Right guess, but outvoted';
      } else {
        pointsEarned = 0;
        reason = 'Voted for an innocent player';
      }
    }

    p.score += pointsEarned;
    p.roundsPlayed += 1;
    if (wonRound) p.roundsWon += 1;

    recordGlobalScore(p.name, pointsEarned, wonRound, wonAsImposter);

    scoreDeltas.push({
      playerId: p.id,
      playerName: p.name,
      pointsEarned,
      reason,
      wasImposter: isImposter,
    });
  }

  saveLeaderboard();

  const imposterIdsArr = Array.from(round.imposterIds);
  const imposterNames = imposterIdsArr.map((id) => room.players.get(id)?.name ?? 'Unknown');

  room.lastResult = {
    roundNumber: round.roundNumber,
    outcome,
    caughtImposter,
    mostVotedPlayerId,
    mostVotedPlayerName: mostVotedPlayer?.name ?? null,
    mostVotesCount: maxVotes,
    imposterIds: imposterIdsArr,
    imposterNames,
    secretWord: round.wordEntry.word,
    similarWord: round.wordEntry.similarWord,
    category: round.wordEntry.category,
    region: round.wordEntry.region,
    hintType: round.hintType,
    hintValue: round.hintValue,
    startingPlayerId: round.startingPlayerId,
    startingPlayerName: round.startingPlayerName,
    voteCounts,
    voteBreakdown,
    scoreDeltas: scoreDeltas.sort((a, b) => b.pointsEarned - a.pointsEarned),
  };

  room.phase = 'RESULTS';
  broadcastRoom(room);
}

// Clean up stale rooms older than 6 hours with zero connected players
setInterval(() => {
  const cutoff = Date.now() - 6 * 60 * 60 * 1000;
  for (const [code, room] of rooms.entries()) {
    const anyConnected = Array.from(room.players.values()).some((p) => p.connected);
    if (!anyConnected && room.lastActivityAt < cutoff) {
      rooms.delete(code);
    }
  }
}, 15 * 60 * 1000);

async function bootstrap(): Promise<void> {
  const app = express();
  app.use(express.json());

  // REST API endpoints
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      activeRooms: rooms.size,
      totalWords: WORD_BANK.length,
    });
  });

  app.get('/api/words/stats', (_req, res) => {
    res.json(WORD_BANK_STATS);
  });

  app.get('/api/leaderboard', (_req, res) => {
    res.json({
      leaderboard: getSortedGlobalLeaderboard().slice(0, 50),
    });
  });

  app.post('/api/rooms', (req, res) => {
    const body = req.body as Partial<RoomSettings> | undefined;
    const room = createRoom({
      wordPack:
        body?.wordPack === 'indian' || body?.wordPack === 'global' || body?.wordPack === 'mixed'
          ? body.wordPack
          : 'mixed',
      hintMode:
        body?.hintMode === 'similar_word' || body?.hintMode === 'category' || body?.hintMode === 'either'
          ? body.hintMode
          : 'either',
    });
    res.status(201).json({ code: room.code });
  });

  app.get('/api/rooms/:code', (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      res.status(404).json({ exists: false, message: 'Room not found. Check the 4-letter code.' });
      return;
    }
    const connectedCount = Array.from(room.players.values()).filter((p) => p.connected).length;
    res.json({
      exists: true,
      code: room.code,
      phase: room.phase,
      playerCount: connectedCount,
      roundNumber: room.roundNumber,
    });
  });

  const httpServer = http.createServer(app);

  // Attach WebSocket server strictly on /ws so it coexists cleanly with Vite
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  interface SocketMeta {
    roomCode: string | null;
    playerId: string | null;
    isAlive: boolean;
  }

  const socketMeta = new WeakMap<WebSocket, SocketMeta>();

  const heartbeatInterval = setInterval(() => {
    for (const client of wss.clients) {
      const meta = socketMeta.get(client);
      if (!meta) continue;
      if (!meta.isAlive) {
        client.terminate();
        continue;
      }
      meta.isAlive = false;
      client.ping();
    }
  }, 25000);

  wss.on('close', () => clearInterval(heartbeatInterval));

  wss.on('connection', (ws) => {
    socketMeta.set(ws, { roomCode: null, playerId: null, isAlive: true });

    ws.on('pong', () => {
      const meta = socketMeta.get(ws);
      if (meta) meta.isAlive = true;
    });

    ws.on('message', (raw) => {
      const meta = socketMeta.get(ws);
      if (!meta) return;
      meta.isAlive = true;

      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(raw)) as ClientMessage;
      } catch {
        sendToSocket(ws, { type: 'room:error', message: 'Invalid message payload.' });
        return;
      }

      if (msg.type === 'ping') {
        sendToSocket(ws, { type: 'pong' });
        return;
      }

      if (msg.type === 'room:join') {
        const roomCode = String(msg.roomCode || '').trim().toUpperCase();
        const playerId = String(msg.playerId || '').trim().slice(0, 64);
        const cleanName = String(msg.playerName || '').trim().replace(/\s+/g, ' ').slice(0, 22);

        if (!roomCode || !playerId || cleanName.length < 1) {
          sendToSocket(ws, { type: 'room:error', message: 'Enter your name and a valid 4-letter room code.' });
          return;
        }

        const room = rooms.get(roomCode);
        if (!room) {
          sendToSocket(ws, { type: 'room:error', message: `Room ${roomCode} does not exist or has expired.` });
          return;
        }

        // Prevent duplicate display names for different player IDs
        const duplicateName = Array.from(room.players.values()).find(
          (p) => p.id !== playerId && p.name.toLowerCase() === cleanName.toLowerCase(),
        );
        if (duplicateName) {
          sendToSocket(ws, {
            type: 'room:error',
            message: `"${cleanName}" is already taken in this room. Pick a slightly different name.`,
          });
          return;
        }

        const existingPlayer = room.players.get(playerId);
        if (existingPlayer) {
          existingPlayer.name = cleanName;
          existingPlayer.connected = true;
          existingPlayer.ws = ws;
        } else {
          if (room.players.size >= 16) {
            sendToSocket(ws, { type: 'room:error', message: 'Room is full (max 16 players).' });
            return;
          }
          const isFirstPlayer = room.players.size === 0;
          const color = AVATAR_COLORS[room.players.size % AVATAR_COLORS.length];
          room.players.set(playerId, {
            id: playerId,
            name: cleanName,
            avatarColor: color,
            isHost: isFirstPlayer,
            connected: true,
            score: 0,
            roundsWon: 0,
            roundsPlayed: 0,
            isReadyToVote: false,
            inCurrentRound: false,
            ws,
          });
        }

        meta.roomCode = roomCode;
        meta.playerId = playerId;
        ensureRoomHasHost(room);
        broadcastRoom(room);
        return;
      }

      // All subsequent actions require an active room & player
      if (!meta.roomCode || !meta.playerId) {
        sendToSocket(ws, { type: 'room:error', message: 'Not connected to a room.' });
        return;
      }

      const room = rooms.get(meta.roomCode);
      if (!room) {
        sendToSocket(ws, { type: 'room:error', message: 'Room no longer exists.' });
        return;
      }

      const player = room.players.get(meta.playerId);
      if (!player) {
        sendToSocket(ws, { type: 'room:error', message: 'Player session not found in room.' });
        return;
      }

      switch (msg.type) {
        case 'room:update_settings': {
          if (!player.isHost) {
            sendToSocket(ws, { type: 'room:error', message: 'Only the host can change room settings.' });
            return;
          }
          if (msg.settings.wordPack && ['mixed', 'indian', 'global'].includes(msg.settings.wordPack)) {
            room.settings.wordPack = msg.settings.wordPack;
          }
          if (msg.settings.hintMode && ['either', 'similar_word', 'category'].includes(msg.settings.hintMode)) {
            room.settings.hintMode = msg.settings.hintMode;
          }
          if (typeof msg.settings.imposterCount === 'number') {
            room.settings.imposterCount = msg.settings.imposterCount === 2 ? 2 : 1;
          }
          broadcastRoom(room);
          break;
        }

        case 'room:start_round': {
          if (!player.isHost) {
            sendToSocket(ws, { type: 'room:error', message: 'Only the host can start the round.' });
            return;
          }
          const err = startNewRound(room);
          if (err) {
            sendToSocket(ws, { type: 'room:error', message: err });
          }
          break;
        }

        case 'room:ready_to_vote': {
          if (room.phase !== 'PLAYING' || !player.inCurrentRound) return;
          player.isReadyToVote = Boolean(msg.ready);
          const activePlayers = Array.from(room.players.values()).filter((p) => p.inCurrentRound && p.connected);
          if (activePlayers.length > 0 && activePlayers.every((p) => p.isReadyToVote)) {
            room.phase = 'VOTING';
          }
          broadcastRoom(room);
          break;
        }

        case 'room:open_voting': {
          if (!player.isHost) {
            sendToSocket(ws, { type: 'room:error', message: 'Only the host can open voting early.' });
            return;
          }
          if (room.phase !== 'PLAYING') return;
          room.phase = 'VOTING';
          broadcastRoom(room);
          break;
        }

        case 'room:cast_vote': {
          if (room.phase !== 'VOTING' || !room.activeRound || !player.inCurrentRound) return;
          const targetId = String(msg.targetId || '');
          if (!targetId || targetId === player.id) {
            sendToSocket(ws, { type: 'room:error', message: 'You cannot vote for yourself.' });
            return;
          }
          const target = room.players.get(targetId);
          if (!target || !target.inCurrentRound) {
            sendToSocket(ws, { type: 'room:error', message: 'Selected player is not in this round.' });
            return;
          }
          room.activeRound.votes.set(player.id, targetId);

          // Automatically finalize once all connected active round players have voted
          const activeVoters = Array.from(room.players.values()).filter((p) => p.inCurrentRound && p.connected);
          const allVoted = activeVoters.length > 0 && activeVoters.every((p) => room.activeRound?.votes.has(p.id));
          if (allVoted) {
            finalizeVoting(room);
          } else {
            broadcastRoom(room);
          }
          break;
        }

        case 'room:force_tally': {
          if (!player.isHost) {
            sendToSocket(ws, { type: 'room:error', message: 'Only the host can reveal results early.' });
            return;
          }
          if (room.phase === 'VOTING') {
            finalizeVoting(room);
          }
          break;
        }

        case 'room:back_to_lobby': {
          if (!player.isHost) {
            sendToSocket(ws, { type: 'room:error', message: 'Only the host can return the room to lobby.' });
            return;
          }
          room.phase = 'LOBBY';
          room.activeRound = null;
          for (const p of room.players.values()) {
            p.isReadyToVote = false;
            p.inCurrentRound = false;
          }
          broadcastRoom(room);
          break;
        }

        case 'room:kick_player': {
          if (!player.isHost) return;
          const targetId = String(msg.targetId || '');
          if (!targetId || targetId === player.id) return;
          const target = room.players.get(targetId);
          if (!target) return;
          sendToSocket(target.ws, { type: 'room:kicked', message: 'You were removed from the room by the host.' });
          if (target.ws) {
            const tMeta = socketMeta.get(target.ws);
            if (tMeta) {
              tMeta.roomCode = null;
              tMeta.playerId = null;
            }
          }
          room.players.delete(targetId);
          broadcastRoom(room);
          break;
        }

        case 'room:leave': {
          room.players.delete(player.id);
          meta.roomCode = null;
          meta.playerId = null;
          ensureRoomHasHost(room);
          broadcastRoom(room);
          break;
        }
      }
    });

    ws.on('close', () => {
      const meta = socketMeta.get(ws);
      if (!meta || !meta.roomCode || !meta.playerId) return;
      const room = rooms.get(meta.roomCode);
      if (!room) return;
      const player = room.players.get(meta.playerId);
      if (!player) return;

      // Only mark disconnected if this socket is the player's latest active socket
      if (player.ws === ws) {
        player.connected = false;
        player.ws = null;
        ensureRoomHasHost(room);
        broadcastRoom(room);
      }
    });
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Khabri server listening on http://0.0.0.0:${PORT} (${WORD_BANK.length} words loaded)`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start Khabri server:', err);
  process.exit(1);
});
