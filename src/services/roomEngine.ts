import Peer, { type DataConnection } from 'peerjs';
import { WORD_BANK, getPackPool, pickRandomWord, secureRandomInt } from '../data/wordBank';
import type {
  ClientMessage,
  GamePhase,
  GlobalLeaderboardEntry,
  PlayerRoundScoreDelta,
  PublicPlayer,
  PublicRoomState,
  RoomSettings,
  RoundResult,
  SecretPlayerAssignment,
  ServerMessage,
  VoteBreakdownItem,
  WordEntry,
} from '../types/game';
import {
  loadGlobalLeaderboard,
  loadUsedWordIds,
  mergeSyncedLeaderboard,
  recordPlayerRoundInLeaderboard,
  saveHostRoomSnapshot,
  saveUsedWordIds,
  type PersistedHostSnapshot,
} from './localStore';

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
const PEER_PREFIX = 'khabri-v1-';

const PEER_CONFIG = {
  debug: 0,
  pingInterval: 5000,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:global.stun.twilio.com:3478' },
    ],
  },
};

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += ROOM_CODE_CHARS[secureRandomInt(ROOM_CODE_CHARS.length)];
  }
  return code;
}

interface InternalPlayer {
  id: string;
  name: string;
  avatarColor: string;
  connected: boolean;
  score: number;
  roundsWon: number;
  roundsPlayed: number;
  inCurrentRound: boolean;
  transport: 'local' | 'peer' | 'bc';
  peerConn: DataConnection | null;
}

interface ActiveRound {
  roundNumber: number;
  wordEntry: WordEntry;
  imposterIds: Set<string>;
  startingPlayerId: string;
  startingPlayerName: string;
  votes: Map<string, string>;
}

type BroadcastEnvelope =
  | { dir: 'c2h'; senderId: string; payload: ClientMessage }
  | { dir: 'h2c'; targetId: string; payload: ServerMessage };

export interface SessionCallbacks {
  onState: (state: PublicRoomState, secret: SecretPlayerAssignment | null) => void;
  onStatus: (status: 'idle' | 'connecting' | 'connected' | 'reconnecting') => void;
  onError: (message: string) => void;
  onKicked: (message: string) => void;
  onLeaderboardChanged: (entries: GlobalLeaderboardEntry[]) => void;
}

/**
 * Room Engine hosted transparently on the creator's device.
 * The room creator has NO special gameplay privileges—every player can configure lobby settings,
 * start rounds, and vote equally. The imposter is NEVER revealed until ALL active players have voted.
 */
export class HostRoomController {
  public code: string;
  private creatorId: string;
  private phase: GamePhase = 'LOBBY';
  private roundNumber = 0;
  private settings: RoomSettings;
  private players = new Map<string, InternalPlayer>();
  private usedWordIds: Set<string>;
  private activeRound: ActiveRound | null = null;
  private lastResult: RoundResult | null = null;

  private peer: Peer | null = null;
  private bc: BroadcastChannel | null = null;
  private destroyed = false;
  private callbacks: SessionCallbacks;
  private idRetries = 0;
  private peerRetryTimer: number | null = null;

  constructor(
    options: {
      hostId: string;
      hostName: string;
      settings: RoomSettings;
      restoreSnapshot?: PersistedHostSnapshot;
    },
    callbacks: SessionCallbacks,
  ) {
    this.creatorId = options.hostId;
    this.callbacks = callbacks;
    this.usedWordIds = loadUsedWordIds();

    if (options.restoreSnapshot) {
      const snap = options.restoreSnapshot;
      this.code = snap.code;
      this.roundNumber = snap.roundNumber;
      this.settings = {
        wordPack: snap.settings?.wordPack ?? 'mixed',
        imposterCount: snap.settings?.imposterCount === 2 ? 2 : 1,
      };
      for (const p of snap.players) {
        const isCreator = p.id === snap.hostPlayerId || p.id === options.hostId || p.isHost;
        const resolvedId = isCreator ? options.hostId : p.id;
        this.players.set(resolvedId, {
          id: resolvedId,
          name: p.name,
          avatarColor: p.avatarColor,
          connected: isCreator,
          score: p.score,
          roundsWon: p.roundsWon,
          roundsPlayed: p.roundsPlayed,
          inCurrentRound: false,
          transport: isCreator ? 'local' : 'peer',
          peerConn: null,
        });
      }
      if (!this.players.has(options.hostId)) {
        this.addCreatorPlayer(options.hostId, options.hostName);
      }
    } else {
      this.code = generateRoomCode();
      this.settings = { ...options.settings };
      this.addCreatorPlayer(options.hostId, options.hostName);
    }

    this.callbacks.onStatus('connecting');
    this.initTransports();
    this.persistSnapshot();
    this.broadcastAll();
  }

  private addCreatorPlayer(id: string, name: string): void {
    this.players.set(id, {
      id,
      name: name.trim().slice(0, 22),
      avatarColor: AVATAR_COLORS[0],
      connected: true,
      score: 0,
      roundsWon: 0,
      roundsPlayed: 0,
      inCurrentRound: false,
      transport: 'local',
      peerConn: null,
    });
  }

  private clearPeerRetryTimer(): void {
    if (this.peerRetryTimer !== null) {
      window.clearTimeout(this.peerRetryTimer);
      this.peerRetryTimer = null;
    }
  }

  private initTransports(): void {
    this.setupBroadcastChannel();
    this.setupPeer();
  }

  private setupBroadcastChannel(): void {
    if (this.bc) {
      this.bc.close();
      this.bc = null;
    }
    if (typeof BroadcastChannel === 'undefined') return;

    const channel = new BroadcastChannel(`khabri-bc-${this.code}`);
    channel.onmessage = (event: MessageEvent<BroadcastEnvelope>) => {
      if (this.destroyed) return;
      const env = event.data;
      if (!env || env.dir !== 'c2h') return;
      this.handleClientMessage(env.senderId, env.payload, 'bc', null);
    };
    this.bc = channel;
  }

  private setupPeer(): void {
    this.clearPeerRetryTimer();
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        // Ignore teardown errors
      }
      this.peer = null;
    }

    const peerId = `${PEER_PREFIX}${this.code}`;
    const peer = new Peer(peerId, PEER_CONFIG);
    this.peer = peer;

    peer.on('open', () => {
      if (this.destroyed || this.peer !== peer) return;
      this.callbacks.onStatus('connected');
      this.broadcastAll();
    });

    peer.on('connection', (conn) => {
      if (this.destroyed) {
        conn.close();
        return;
      }

      let boundPlayerId: string | null = null;

      conn.on('data', (raw) => {
        if (this.destroyed) return;
        const msg = raw as ClientMessage;
        if (!msg || typeof msg !== 'object' || !('type' in msg)) return;

        if (msg.type === 'room:join') {
          boundPlayerId = msg.playerId;
          this.handleClientMessage(msg.playerId, msg, 'peer', conn);
          return;
        }
        if (boundPlayerId) {
          this.handleClientMessage(boundPlayerId, msg, 'peer', conn);
        }
      });

      const handleDisconnect = () => {
        if (this.destroyed || !boundPlayerId) return;
        const p = this.players.get(boundPlayerId);
        if (p && p.peerConn === conn) {
          p.connected = false;
          p.peerConn = null;
          this.checkAutoFinalizeVotes();
          this.broadcastAll();
        }
      };

      conn.on('close', handleDisconnect);
      conn.on('error', handleDisconnect);
    });

    peer.on('error', (err) => {
      if (this.destroyed || this.peer !== peer) return;
      if (err.type === 'unavailable-id' && this.idRetries < 5 && this.players.size <= 1) {
        this.idRetries += 1;
        this.code = generateRoomCode();
        this.persistSnapshot();
        this.setupBroadcastChannel();
        this.setupPeer();
        this.broadcastAll();
        return;
      }

      // Recover from transient signaling/network failures automatically
      if (
        err.type === 'network' ||
        err.type === 'server-error' ||
        err.type === 'socket-error' ||
        err.type === 'socket-closed' ||
        err.type === 'disconnected'
      ) {
        this.callbacks.onStatus('reconnecting');
        this.clearPeerRetryTimer();
        this.peerRetryTimer = window.setTimeout(() => {
          if (!this.destroyed) this.reconnectIfDropped();
        }, 2500);
      }
    });

    peer.on('disconnected', () => {
      if (this.destroyed || this.peer !== peer || peer.destroyed) return;
      try {
        peer.reconnect();
      } catch {
        this.clearPeerRetryTimer();
        this.peerRetryTimer = window.setTimeout(() => {
          if (!this.destroyed) this.setupPeer();
        }, 2500);
      }
    });
  }

  public reconnectIfDropped(): void {
    if (this.destroyed) return;
    if (!this.peer || this.peer.destroyed) {
      this.setupPeer();
      return;
    }
    if (this.peer.disconnected) {
      try {
        this.peer.reconnect();
      } catch {
        this.setupPeer();
      }
    }
  }

  public sendHostAction(msg: ClientMessage): void {
    this.handleClientMessage(this.creatorId, msg, 'local', null);
  }

  private sendToPlayer(player: InternalPlayer, message: ServerMessage): void {
    if (player.id === this.creatorId) {
      if (message.type === 'room:state') {
        this.callbacks.onState(message.state, message.secret);
      } else if (message.type === 'room:error') {
        this.callbacks.onError(message.message);
      }
      return;
    }

    if (player.transport === 'peer' && player.peerConn) {
      const conn = player.peerConn;
      const trySend = () => {
        try {
          conn.send(message);
        } catch {
          // Ignore dropped frame
        }
      };
      if (conn.open) {
        trySend();
      } else {
        conn.once('open', trySend);
      }
    } else if (player.transport === 'bc' && this.bc) {
      const env: BroadcastEnvelope = { dir: 'h2c', targetId: player.id, payload: message };
      this.bc.postMessage(env);
    }
  }

  private sendErrorDirect(
    senderId: string,
    transport: 'local' | 'peer' | 'bc',
    conn: DataConnection | null,
    message: string,
  ): void {
    const payload: ServerMessage = { type: 'room:error', message };
    if (transport === 'local') {
      this.callbacks.onError(message);
    } else if (transport === 'peer' && conn) {
      if (conn.open) {
        conn.send(payload);
      } else {
        conn.once('open', () => {
          try {
            conn.send(payload);
          } catch {
            // Ignore
          }
        });
      }
    } else if (transport === 'bc' && this.bc) {
      this.bc.postMessage({ dir: 'h2c', targetId: senderId, payload } satisfies BroadcastEnvelope);
    }
  }

  private buildPublicRoomState(viewerId: string): PublicRoomState {
    const activeVotes = this.activeRound?.votes;
    const players: PublicPlayer[] = Array.from(this.players.values())
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.name.localeCompare(b.name);
      })
      .map((p) => ({
        id: p.id,
        name: p.name,
        avatarColor: p.avatarColor,
        connected: p.connected,
        score: p.score,
        roundsWon: p.roundsWon,
        roundsPlayed: p.roundsPlayed,
        hasVoted: activeVotes ? activeVotes.has(p.id) : false,
        inCurrentRound: p.inCurrentRound,
      }));

    const activeVoters = Array.from(this.players.values()).filter((p) => p.inCurrentRound && p.connected);
    const votedCount = activeVotes
      ? activeVoters.filter((p) => activeVotes.has(p.id)).length
      : 0;
    const packPool = getPackPool(this.settings.wordPack);
    const usedInPack = packPool.filter((w) => this.usedWordIds.has(w.id)).length;

    return {
      code: this.code,
      phase: this.phase,
      roundNumber: this.roundNumber,
      settings: { ...this.settings },
      players,
      startingPlayerId: this.activeRound?.startingPlayerId ?? this.lastResult?.startingPlayerId ?? null,
      startingPlayerName: this.activeRound?.startingPlayerName ?? this.lastResult?.startingPlayerName ?? null,
      usedWordCount: usedInPack,
      availableWordCount: Math.max(0, packPool.length - usedInPack),
      totalBankSize: WORD_BANK.length,
      votedCount,
      activeVoterCount: activeVoters.length,
      myVoteTargetId: activeVotes?.get(viewerId) ?? null,
      // Strictly null until phase === 'RESULTS' (only after ALL players have voted)
      lastResult: this.phase === 'RESULTS' ? this.lastResult : null,
    };
  }

  private buildSecretForPlayer(playerId: string): SecretPlayerAssignment | null {
    if (!this.activeRound) return null;
    const player = this.players.get(playerId);
    if (!player || !player.inCurrentRound) return null;

    const isImposter = this.activeRound.imposterIds.has(playerId);
    if (isImposter) {
      // Imposter strictly receives ONLY the word's category—never the word itself
      return {
        roundNumber: this.activeRound.roundNumber,
        role: 'imposter',
        category: this.activeRound.wordEntry.category,
      };
    }

    return {
      roundNumber: this.activeRound.roundNumber,
      role: 'civilian',
      word: this.activeRound.wordEntry.word,
    };
  }

  private broadcastAll(includeLeaderboard = false): void {
    const leaderboard = includeLeaderboard ? loadGlobalLeaderboard().slice(0, 100) : null;
    for (const p of this.players.values()) {
      if (!p.connected) continue;
      this.sendToPlayer(p, {
        type: 'room:state',
        state: this.buildPublicRoomState(p.id),
        secret: this.buildSecretForPlayer(p.id),
      });
      if (leaderboard && p.id !== this.creatorId) {
        this.sendToPlayer(p, { type: 'leaderboard:updated', leaderboard });
      }
    }
    if (leaderboard) {
      this.callbacks.onLeaderboardChanged(leaderboard);
    }
  }

  private persistSnapshot(): void {
    const creator = this.players.get(this.creatorId);
    if (!creator) return;
    const snapshot: PersistedHostSnapshot = {
      code: this.code,
      hostPlayerId: this.creatorId,
      hostPlayerName: creator.name,
      roundNumber: this.roundNumber,
      settings: { ...this.settings },
      players: Array.from(this.players.values()).map((p) => ({
        id: p.id,
        name: p.name,
        avatarColor: p.avatarColor,
        isHost: p.id === this.creatorId,
        score: p.score,
        roundsWon: p.roundsWon,
        roundsPlayed: p.roundsPlayed,
      })),
      updatedAt: Date.now(),
    };
    saveHostRoomSnapshot(snapshot);
  }

  private checkAutoFinalizeVotes(): boolean {
    if (this.phase !== 'PLAYING' || !this.activeRound) return false;
    const activeVoters = Array.from(this.players.values()).filter((p) => p.inCurrentRound && p.connected);
    if (activeVoters.length > 0 && activeVoters.every((p) => this.activeRound?.votes.has(p.id))) {
      this.finalizeVoting();
      return true;
    }
    return false;
  }

  private migrateDisconnectedPlayerId(oldId: string, newId: string): void {
    if (!this.activeRound) return;
    if (this.activeRound.imposterIds.has(oldId)) {
      this.activeRound.imposterIds.delete(oldId);
      this.activeRound.imposterIds.add(newId);
    }
    if (this.activeRound.startingPlayerId === oldId) {
      this.activeRound.startingPlayerId = newId;
    }
    if (this.activeRound.votes.has(oldId)) {
      const target = this.activeRound.votes.get(oldId)!;
      this.activeRound.votes.delete(oldId);
      this.activeRound.votes.set(newId, target);
    }
    for (const [voterId, targetId] of this.activeRound.votes.entries()) {
      if (targetId === oldId) {
        this.activeRound.votes.set(voterId, newId);
      }
    }
  }

  private handleClientMessage(
    senderId: string,
    msg: ClientMessage,
    transport: 'local' | 'peer' | 'bc',
    conn: DataConnection | null,
  ): void {
    if (msg.type === 'ping') {
      const p = this.players.get(senderId);
      if (p) this.sendToPlayer(p, { type: 'pong' });
      return;
    }

    if (msg.type === 'room:join') {
      // Defensive guard: a remote tab/device must never overwrite the local room creator's player record
      if (transport !== 'local' && senderId === this.creatorId) {
        this.sendErrorDirect(
          senderId,
          transport,
          conn,
          'You are already hosting this room in another tab. Refresh this tab to join as a separate player.',
        );
        return;
      }

      const cleanName = String(msg.playerName || '').trim().replace(/\s+/g, ' ').slice(0, 22);
      if (!cleanName) {
        this.sendErrorDirect(senderId, transport, conn, 'Enter your name before joining.');
        return;
      }

      const duplicate = Array.from(this.players.values()).find(
        (p) => p.id !== senderId && p.name.toLowerCase() === cleanName.toLowerCase(),
      );

      if (duplicate) {
        // If that name belongs to a currently connected player (or the creator), reject duplicate
        if (duplicate.connected || duplicate.id === this.creatorId) {
          this.sendErrorDirect(
            senderId,
            transport,
            conn,
            `"${cleanName}" is already in this room. Pick a slightly different name.`,
          );
          return;
        }
        // Seamless reclaim when a disconnected guest reopens the link/QR in a fresh mobile browser tab
        this.players.delete(duplicate.id);
        this.migrateDisconnectedPlayerId(duplicate.id, senderId);
        this.players.set(senderId, {
          ...duplicate,
          id: senderId,
          name: cleanName,
          connected: true,
          transport,
          peerConn: conn,
        });
        this.persistSnapshot();
        this.broadcastAll(true);
        return;
      }

      const existing = this.players.get(senderId);
      if (existing) {
        existing.name = cleanName;
        existing.connected = true;
        existing.transport = transport;
        existing.peerConn = conn;
      } else {
        if (this.players.size >= 16) {
          this.sendErrorDirect(senderId, transport, conn, 'Room is full (maximum 16 players).');
          return;
        }
        const color = AVATAR_COLORS[this.players.size % AVATAR_COLORS.length];
        this.players.set(senderId, {
          id: senderId,
          name: cleanName,
          avatarColor: color,
          connected: true,
          score: 0,
          roundsWon: 0,
          roundsPlayed: 0,
          inCurrentRound: false,
          transport,
          peerConn: conn,
        });
      }

      this.persistSnapshot();
      this.broadcastAll(true);
      return;
    }

    const player = this.players.get(senderId);
    if (!player) {
      this.sendErrorDirect(senderId, transport, conn, 'Player not registered in this room.');
      return;
    }

    // Equal rights: ANY connected player in the room can update lobby settings, start rounds, vote, or return to lobby
    switch (msg.type) {
      case 'room:update_settings': {
        if (this.phase !== 'LOBBY') return;
        if (msg.settings.wordPack && ['mixed', 'indian', 'global'].includes(msg.settings.wordPack)) {
          this.settings.wordPack = msg.settings.wordPack;
        }
        if (typeof msg.settings.imposterCount === 'number') {
          this.settings.imposterCount = msg.settings.imposterCount === 2 ? 2 : 1;
        }
        this.persistSnapshot();
        this.broadcastAll();
        break;
      }

      case 'room:start_round': {
        if (this.phase === 'PLAYING') return;
        const connectedPlayers = Array.from(this.players.values()).filter((p) => p.connected);
        if (connectedPlayers.length < 3) {
          this.sendErrorDirect(
            senderId,
            transport,
            conn,
            'At least 3 connected players are required to start a round.',
          );
          return;
        }

        // Non-repeating word persisted in localStorage across months
        const { entry, wrappedAround } = pickRandomWord(this.settings.wordPack, this.usedWordIds);
        if (wrappedAround) {
          const packPool = getPackPool(this.settings.wordPack);
          for (const w of packPool) this.usedWordIds.delete(w.id);
        }
        this.usedWordIds.add(entry.id);
        saveUsedWordIds(this.usedWordIds);

        const actualImposterCount = connectedPlayers.length >= 6 && this.settings.imposterCount === 2 ? 2 : 1;
        const shuffled = [...connectedPlayers];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = secureRandomInt(i + 1);
          const tmp = shuffled[i];
          shuffled[i] = shuffled[j];
          shuffled[j] = tmp;
        }
        const imposterIds = new Set(shuffled.slice(0, actualImposterCount).map((p) => p.id));

        const starter = connectedPlayers[secureRandomInt(connectedPlayers.length)];

        this.roundNumber += 1;
        this.phase = 'PLAYING';
        this.lastResult = null;

        for (const p of this.players.values()) {
          p.inCurrentRound = p.connected;
        }

        this.activeRound = {
          roundNumber: this.roundNumber,
          wordEntry: entry,
          imposterIds,
          startingPlayerId: starter.id,
          startingPlayerName: starter.name,
          votes: new Map(),
        };

        this.persistSnapshot();
        this.broadcastAll();
        break;
      }

      case 'room:cast_vote': {
        if (this.phase !== 'PLAYING' || !this.activeRound || !player.inCurrentRound) return;
        const targetId = String(msg.targetId || '');
        if (!targetId || targetId === player.id) {
          this.sendErrorDirect(senderId, transport, conn, 'You cannot vote for yourself.');
          return;
        }
        const target = this.players.get(targetId);
        if (!target || !target.inCurrentRound) return;

        this.activeRound.votes.set(player.id, targetId);

        // Reveal happens ONLY automatically once ALL active players have cast their vote
        const finalized = this.checkAutoFinalizeVotes();
        if (!finalized) {
          this.broadcastAll();
        }
        break;
      }

      case 'room:back_to_lobby': {
        // Only allowed once round results are already revealed (never mid-round to peek or cancel)
        if (this.phase !== 'RESULTS') return;
        this.phase = 'LOBBY';
        this.activeRound = null;
        for (const p of this.players.values()) {
          p.inCurrentRound = false;
        }
        this.persistSnapshot();
        this.broadcastAll();
        break;
      }

      case 'room:leave': {
        if (player.id === this.creatorId) return;
        this.players.delete(player.id);
        this.checkAutoFinalizeVotes();
        this.persistSnapshot();
        this.broadcastAll();
        break;
      }
    }
  }

  private finalizeVoting(): void {
    if (!this.activeRound || this.phase !== 'PLAYING') return;

    const round = this.activeRound;
    const roundPlayers = Array.from(this.players.values()).filter((p) => p.inCurrentRound);

    const voteCounts: Record<string, number> = {};
    for (const p of roundPlayers) voteCounts[p.id] = 0;

    const voteBreakdown: VoteBreakdownItem[] = [];
    for (const [voterId, targetId] of round.votes.entries()) {
      const voter = this.players.get(voterId);
      const target = this.players.get(targetId);
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
    const mostVotedPlayer = mostVotedPlayerId ? this.players.get(mostVotedPlayerId) ?? null : null;
    const caughtImposter = Boolean(mostVotedPlayerId && round.imposterIds.has(mostVotedPlayerId));

    const outcome: RoundResult['outcome'] = caughtImposter
      ? 'imposter_caught'
      : isTieOrNoVotes
        ? 'tie_escaped'
        : 'imposter_escaped';

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

      recordPlayerRoundInLeaderboard(p.name, pointsEarned, wonRound, wonAsImposter);

      scoreDeltas.push({
        playerId: p.id,
        playerName: p.name,
        pointsEarned,
        reason,
        wasImposter: isImposter,
      });
    }

    const imposterIdsArr = Array.from(round.imposterIds);
    const imposterNames = imposterIdsArr.map((id) => this.players.get(id)?.name ?? 'Unknown');

    this.lastResult = {
      roundNumber: round.roundNumber,
      outcome,
      caughtImposter,
      mostVotedPlayerId,
      mostVotedPlayerName: mostVotedPlayer?.name ?? null,
      mostVotesCount: maxVotes,
      imposterIds: imposterIdsArr,
      imposterNames,
      secretWord: round.wordEntry.word,
      category: round.wordEntry.category,
      region: round.wordEntry.region,
      startingPlayerId: round.startingPlayerId,
      startingPlayerName: round.startingPlayerName,
      voteCounts,
      voteBreakdown,
      scoreDeltas: scoreDeltas.sort((a, b) => b.pointsEarned - a.pointsEarned),
    };

    this.phase = 'RESULTS';
    this.persistSnapshot();
    this.broadcastAll(true);
  }

  public destroy(clearSnapshot = true): void {
    this.destroyed = true;
    this.clearPeerRetryTimer();
    if (clearSnapshot) {
      saveHostRoomSnapshot(null);
    }
    if (this.bc) {
      this.bc.close();
      this.bc = null;
    }
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        // Ignore teardown error
      }
      this.peer = null;
    }
  }
}

/**
 * Guest Room Client connecting directly to the room creator's device via PeerJS WebRTC (JSON serialization)
 * with instant BroadcastChannel fast-path for same-browser tabs and automatic retries.
 */
export class GuestRoomClient {
  private roomCode: string;
  private playerId: string;
  private playerName: string;
  private callbacks: SessionCallbacks;

  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private bc: BroadcastChannel | null = null;
  private activeTransport: 'none' | 'peer' | 'bc' = 'none';
  private hasReceivedState = false;
  private destroyed = false;
  private connectTimeout: number | null = null;
  private reconnectTimer: number | null = null;
  private joinRetryInterval: number | null = null;
  private peerRetryCount = 0;

  constructor(roomCode: string, playerId: string, playerName: string, callbacks: SessionCallbacks) {
    this.roomCode = roomCode.trim().toUpperCase();
    this.playerId = playerId;
    this.playerName = playerName.trim();
    this.callbacks = callbacks;

    this.callbacks.onStatus('connecting');
    this.connect();
  }

  private clearTimers(): void {
    if (this.connectTimeout !== null) {
      window.clearTimeout(this.connectTimeout);
      this.connectTimeout = null;
    }
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.joinRetryInterval !== null) {
      window.clearInterval(this.joinRetryInterval);
      this.joinRetryInterval = null;
    }
  }

  private buildJoinMsg(): ClientMessage {
    return {
      type: 'room:join',
      roomCode: this.roomCode,
      playerId: this.playerId,
      playerName: this.playerName,
    };
  }

  private handleIncoming(msg: ServerMessage): void {
    if (this.destroyed) return;
    if (msg.type === 'room:state') {
      this.hasReceivedState = true;
      this.peerRetryCount = 0;
      this.clearTimers();
      this.callbacks.onStatus('connected');
      this.callbacks.onState(msg.state, msg.secret);
    } else if (msg.type === 'room:error') {
      this.clearTimers();
      this.callbacks.onError(msg.message);
      if (
        msg.message.includes('already in this room') ||
        msg.message.includes('Room is full') ||
        msg.message.includes('already hosting')
      ) {
        this.destroy();
        this.callbacks.onStatus('idle');
      }
    } else if (msg.type === 'room:kicked') {
      this.clearTimers();
      this.destroy();
      this.callbacks.onKicked(msg.message);
    } else if (msg.type === 'leaderboard:updated') {
      const merged = mergeSyncedLeaderboard(msg.leaderboard);
      this.callbacks.onLeaderboardChanged(merged);
    }
  }

  private dialHostPeer(peer: Peer): void {
    if (this.destroyed || this.activeTransport === 'bc' || peer !== this.peer) return;

    if (this.conn) {
      try {
        this.conn.close();
      } catch {
        // Ignore
      }
      this.conn = null;
    }

    const joinMsg = this.buildJoinMsg();
    const conn = peer.connect(`${PEER_PREFIX}${this.roomCode}`, {
      reliable: true,
      serialization: 'json',
    });
    this.conn = conn;

    conn.on('open', () => {
      if (this.destroyed || this.activeTransport === 'bc' || conn !== this.conn) {
        conn.close();
        return;
      }
      this.activeTransport = 'peer';
      if (this.bc) {
        this.bc.close();
        this.bc = null;
      }

      // Send join immediately and keep resending briefly until first room:state confirms delivery
      conn.send(joinMsg);
      if (this.joinRetryInterval !== null) {
        window.clearInterval(this.joinRetryInterval);
      }
      this.joinRetryInterval = window.setInterval(() => {
        if (this.destroyed || this.hasReceivedState || this.activeTransport !== 'peer' || !conn.open) {
          if (this.joinRetryInterval !== null) {
            window.clearInterval(this.joinRetryInterval);
            this.joinRetryInterval = null;
          }
          return;
        }
        try {
          conn.send(joinMsg);
        } catch {
          // Ignore
        }
      }, 1200);
    });

    conn.on('data', (raw) => {
      if (this.destroyed || this.activeTransport !== 'peer') return;
      this.handleIncoming(raw as ServerMessage);
    });

    conn.on('close', () => {
      if (this.destroyed || this.activeTransport !== 'peer' || conn !== this.conn) return;
      this.activeTransport = 'none';
      this.hasReceivedState = false;
      this.callbacks.onStatus('reconnecting');
      this.reconnectTimer = window.setTimeout(() => {
        if (!this.destroyed) this.connect();
      }, 1500);
    });

    conn.on('error', () => {
      if (this.destroyed || this.activeTransport === 'bc') return;
      if (this.hasReceivedState) {
        this.activeTransport = 'none';
        this.hasReceivedState = false;
        this.callbacks.onStatus('reconnecting');
        this.reconnectTimer = window.setTimeout(() => {
          if (!this.destroyed) this.connect();
        }, 1800);
      }
    });
  }

  private connect(): void {
    this.clearTimers();
    this.hasReceivedState = false;

    const joinMsg = this.buildJoinMsg();

    // Fast-path for same-browser tabs via BroadcastChannel
    if (typeof BroadcastChannel !== 'undefined') {
      if (this.bc) this.bc.close();
      const channel = new BroadcastChannel(`khabri-bc-${this.roomCode}`);
      channel.onmessage = (event: MessageEvent<BroadcastEnvelope>) => {
        if (this.destroyed) return;
        const env = event.data;
        if (!env || env.dir !== 'h2c' || env.targetId !== this.playerId) return;
        if (this.activeTransport === 'none') {
          this.activeTransport = 'bc';
          if (this.peer) {
            try {
              this.peer.destroy();
            } catch {
              // Ignore
            }
            this.peer = null;
          }
        }
        if (this.activeTransport === 'bc') {
          this.handleIncoming(env.payload);
        }
      };
      this.bc = channel;
      channel.postMessage({ dir: 'c2h', senderId: this.playerId, payload: joinMsg } satisfies BroadcastEnvelope);
    }

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        // Ignore
      }
    }

    const peer = new Peer(PEER_CONFIG);
    this.peer = peer;

    this.connectTimeout = window.setTimeout(() => {
      if (this.destroyed || this.hasReceivedState) return;
      this.callbacks.onError(
        `Could not join room ${this.roomCode}. Make sure the room screen is open on the creator's device and double-check the 4-character code.`,
      );
      this.destroy();
      this.callbacks.onStatus('idle');
    }, 18000);

    peer.on('open', () => {
      if (this.destroyed || this.activeTransport === 'bc' || peer !== this.peer) return;
      this.dialHostPeer(peer);
    });

    peer.on('error', (err) => {
      if (this.destroyed || this.activeTransport === 'bc' || peer !== this.peer) return;
      if (err.type === 'peer-unavailable') {
        // Retry a few times in case the host just created the room or is returning from WhatsApp/background
        if (this.peerRetryCount < 4 && !this.hasReceivedState) {
          this.peerRetryCount += 1;
          this.reconnectTimer = window.setTimeout(() => {
            if (!this.destroyed && this.peer === peer && !this.hasReceivedState) {
              this.dialHostPeer(peer);
            }
          }, 2500);
          return;
        }
        this.clearTimers();
        this.callbacks.onError(
          `Room ${this.roomCode} was not found. Make sure the room creator's screen is open and check the 4-character code.`,
        );
        this.destroy();
        this.callbacks.onStatus('idle');
      }
    });
  }

  public send(msg: ClientMessage): void {
    if (this.destroyed) return;
    if (this.activeTransport === 'peer' && this.conn && this.conn.open) {
      this.conn.send(msg);
    } else if (this.activeTransport === 'bc' && this.bc) {
      this.bc.postMessage({ dir: 'c2h', senderId: this.playerId, payload: msg } satisfies BroadcastEnvelope);
    }
  }

  public reconnectIfDropped(): void {
    if (this.destroyed) return;
    if (this.activeTransport === 'peer' && (!this.conn || !this.conn.open)) {
      this.activeTransport = 'none';
      this.hasReceivedState = false;
      this.callbacks.onStatus('reconnecting');
      this.connect();
    }
  }

  public destroy(): void {
    this.destroyed = true;
    this.clearTimers();
    if (this.bc) {
      this.bc.close();
      this.bc = null;
    }
    if (this.conn) {
      try {
        this.conn.close();
      } catch {
        // Ignore
      }
      this.conn = null;
    }
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        // Ignore
      }
      this.peer = null;
    }
  }
}
