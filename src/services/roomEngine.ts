import Peer, { type DataConnection } from 'peerjs';
import { WORD_BANK, getPackPool, pickRandomWord, secureRandomInt } from '../data/wordBank';
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
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
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
  isHost: boolean;
  connected: boolean;
  score: number;
  roundsWon: number;
  roundsPlayed: number;
  isReadyToVote: boolean;
  inCurrentRound: boolean;
  transport: 'local' | 'peer' | 'bc';
  peerConn: DataConnection | null;
}

interface ActiveRound {
  roundNumber: number;
  wordEntry: WordEntry;
  imposterIds: Set<string>;
  hintType: ImposterHintType;
  hintValue: string;
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
 * Authoritative Host Room Engine running directly in the Host's browser.
 * Persists word history, leaderboard, and room recovery state in localStorage.
 * Connects remote phones over WebRTC (PeerJS) and local browser tabs via BroadcastChannel.
 */
export class HostRoomController {
  public code: string;
  private hostId: string;
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

  constructor(
    options: {
      hostId: string;
      hostName: string;
      settings: RoomSettings;
      restoreSnapshot?: PersistedHostSnapshot;
    },
    callbacks: SessionCallbacks,
  ) {
    this.hostId = options.hostId;
    this.callbacks = callbacks;
    this.usedWordIds = loadUsedWordIds();

    if (options.restoreSnapshot) {
      const snap = options.restoreSnapshot;
      this.code = snap.code;
      this.roundNumber = snap.roundNumber;
      this.settings = { ...snap.settings };
      for (const p of snap.players) {
        this.players.set(p.id, {
          ...p,
          isHost: p.id === options.hostId,
          connected: p.id === options.hostId,
          isReadyToVote: false,
          inCurrentRound: false,
          transport: p.id === options.hostId ? 'local' : 'peer',
          peerConn: null,
        });
      }
      if (!this.players.has(options.hostId)) {
        this.addHostPlayer(options.hostId, options.hostName);
      }
    } else {
      this.code = generateRoomCode();
      this.settings = { ...options.settings };
      this.addHostPlayer(options.hostId, options.hostName);
    }

    this.callbacks.onStatus('connecting');
    this.initTransports();
    this.persistSnapshot();
    this.broadcastAll();
  }

  private addHostPlayer(id: string, name: string): void {
    this.players.set(id, {
      id,
      name: name.trim().slice(0, 22),
      avatarColor: AVATAR_COLORS[0],
      isHost: true,
      connected: true,
      score: 0,
      roundsWon: 0,
      roundsPlayed: 0,
      isReadyToVote: false,
      inCurrentRound: false,
      transport: 'local',
      peerConn: null,
    });
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
      if (this.destroyed) return;
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

      conn.on('close', () => {
        if (this.destroyed || !boundPlayerId) return;
        const p = this.players.get(boundPlayerId);
        if (p && p.peerConn === conn) {
          p.connected = false;
          p.peerConn = null;
          this.broadcastAll();
        }
      });

      conn.on('error', () => {
        if (this.destroyed || !boundPlayerId) return;
        const p = this.players.get(boundPlayerId);
        if (p && p.peerConn === conn) {
          p.connected = false;
          p.peerConn = null;
          this.broadcastAll();
        }
      });
    });

    peer.on('error', (err) => {
      if (this.destroyed) return;
      if (err.type === 'unavailable-id' && this.idRetries < 5 && this.players.size <= 1) {
        this.idRetries += 1;
        this.code = generateRoomCode();
        this.persistSnapshot();
        this.setupBroadcastChannel();
        this.setupPeer();
        this.broadcastAll();
        return;
      }
      // Even if signaling server has a hiccup, keep local room usable and show connected for local/BC
      this.callbacks.onStatus('connected');
    });

    peer.on('disconnected', () => {
      if (this.destroyed || !this.peer || this.peer.destroyed) return;
      try {
        this.peer.reconnect();
      } catch {
        // Ignore reconnect error
      }
    });
  }

  public sendHostAction(msg: ClientMessage): void {
    this.handleClientMessage(this.hostId, msg, 'local', null);
  }

  private sendToPlayer(player: InternalPlayer, message: ServerMessage): void {
    if (player.id === this.hostId) {
      if (message.type === 'room:state') {
        this.callbacks.onState(message.state, message.secret);
      } else if (message.type === 'room:error') {
        this.callbacks.onError(message.message);
      }
      return;
    }

    if (player.transport === 'peer' && player.peerConn && player.peerConn.open) {
      try {
        player.peerConn.send(message);
      } catch {
        // Ignore dropped frame
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
    } else if (transport === 'peer' && conn && conn.open) {
      conn.send(payload);
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
        isHost: p.isHost,
        connected: p.connected,
        score: p.score,
        roundsWon: p.roundsWon,
        roundsPlayed: p.roundsPlayed,
        isReadyToVote: p.isReadyToVote,
        hasVoted: activeVotes ? activeVotes.has(p.id) : false,
        inCurrentRound: p.inCurrentRound,
      }));

    const activePlayers = Array.from(this.players.values()).filter((p) => p.inCurrentRound && p.connected);
    const readyCount = activePlayers.filter((p) => p.isReadyToVote).length;
    const votedCount = activeVotes ? activeVotes.size : 0;
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
      readyCount,
      votedCount,
      myVoteTargetId: activeVotes?.get(viewerId) ?? null,
      lastResult: this.phase === 'RESULTS' ? this.lastResult : null,
    };
  }

  private buildSecretForPlayer(playerId: string): SecretPlayerAssignment | null {
    if (!this.activeRound) return null;
    const player = this.players.get(playerId);
    if (!player || !player.inCurrentRound) return null;

    const isImposter = this.activeRound.imposterIds.has(playerId);
    if (isImposter) {
      // Strictly ONLY ONE hint (similar_word OR category), never both and never the secret word
      return {
        roundNumber: this.activeRound.roundNumber,
        role: 'imposter',
        hintType: this.activeRound.hintType,
        hintValue: this.activeRound.hintValue,
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
      if (leaderboard && p.id !== this.hostId) {
        this.sendToPlayer(p, { type: 'leaderboard:updated', leaderboard });
      }
    }
    if (leaderboard) {
      this.callbacks.onLeaderboardChanged(leaderboard);
    }
  }

  private persistSnapshot(): void {
    const hostPlayer = this.players.get(this.hostId);
    if (!hostPlayer) return;
    const snapshot: PersistedHostSnapshot = {
      code: this.code,
      hostPlayerId: this.hostId,
      hostPlayerName: hostPlayer.name,
      roundNumber: this.roundNumber,
      settings: { ...this.settings },
      players: Array.from(this.players.values()).map((p) => ({
        id: p.id,
        name: p.name,
        avatarColor: p.avatarColor,
        isHost: p.isHost,
        score: p.score,
        roundsWon: p.roundsWon,
        roundsPlayed: p.roundsPlayed,
      })),
      updatedAt: Date.now(),
    };
    saveHostRoomSnapshot(snapshot);
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
      const cleanName = String(msg.playerName || '').trim().replace(/\s+/g, ' ').slice(0, 22);
      if (!cleanName) {
        this.sendErrorDirect(senderId, transport, conn, 'Enter your name before joining.');
        return;
      }

      const duplicate = Array.from(this.players.values()).find(
        (p) => p.id !== senderId && p.name.toLowerCase() === cleanName.toLowerCase(),
      );
      if (duplicate) {
        this.sendErrorDirect(
          senderId,
          transport,
          conn,
          `"${cleanName}" is already in this room. Pick a slightly different name.`,
        );
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
          isHost: false,
          connected: true,
          score: 0,
          roundsWon: 0,
          roundsPlayed: 0,
          isReadyToVote: false,
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

    switch (msg.type) {
      case 'room:update_settings': {
        if (!player.isHost) return;
        if (msg.settings.wordPack && ['mixed', 'indian', 'global'].includes(msg.settings.wordPack)) {
          this.settings.wordPack = msg.settings.wordPack;
        }
        if (msg.settings.hintMode && ['either', 'similar_word', 'category'].includes(msg.settings.hintMode)) {
          this.settings.hintMode = msg.settings.hintMode;
        }
        if (typeof msg.settings.imposterCount === 'number') {
          this.settings.imposterCount = msg.settings.imposterCount === 2 ? 2 : 1;
        }
        this.persistSnapshot();
        this.broadcastAll();
        break;
      }

      case 'room:start_round': {
        if (!player.isHost) return;
        const connectedPlayers = Array.from(this.players.values()).filter((p) => p.connected);
        if (connectedPlayers.length < 3) {
          this.callbacks.onError('At least 3 connected players are required to start a round.');
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

        let hintType: ImposterHintType;
        if (this.settings.hintMode === 'similar_word') hintType = 'similar_word';
        else if (this.settings.hintMode === 'category') hintType = 'category';
        else hintType = secureRandomInt(2) === 0 ? 'similar_word' : 'category';

        const hintValue = hintType === 'similar_word' ? entry.similarWord : entry.category;
        const starter = connectedPlayers[secureRandomInt(connectedPlayers.length)];

        this.roundNumber += 1;
        this.phase = 'PLAYING';
        this.lastResult = null;

        for (const p of this.players.values()) {
          p.isReadyToVote = false;
          p.inCurrentRound = p.connected;
        }

        this.activeRound = {
          roundNumber: this.roundNumber,
          wordEntry: entry,
          imposterIds,
          hintType,
          hintValue,
          startingPlayerId: starter.id,
          startingPlayerName: starter.name,
          votes: new Map(),
        };

        this.persistSnapshot();
        this.broadcastAll();
        break;
      }

      case 'room:ready_to_vote': {
        if (this.phase !== 'PLAYING' || !player.inCurrentRound) return;
        player.isReadyToVote = Boolean(msg.ready);
        const activePlayers = Array.from(this.players.values()).filter((p) => p.inCurrentRound && p.connected);
        if (activePlayers.length > 0 && activePlayers.every((p) => p.isReadyToVote)) {
          this.phase = 'VOTING';
        }
        this.broadcastAll();
        break;
      }

      case 'room:open_voting': {
        if (!player.isHost || this.phase !== 'PLAYING') return;
        this.phase = 'VOTING';
        this.broadcastAll();
        break;
      }

      case 'room:cast_vote': {
        if (this.phase !== 'VOTING' || !this.activeRound || !player.inCurrentRound) return;
        const targetId = String(msg.targetId || '');
        if (!targetId || targetId === player.id) {
          this.sendErrorDirect(senderId, transport, conn, 'You cannot vote for yourself.');
          return;
        }
        const target = this.players.get(targetId);
        if (!target || !target.inCurrentRound) return;

        this.activeRound.votes.set(player.id, targetId);
        const activeVoters = Array.from(this.players.values()).filter((p) => p.inCurrentRound && p.connected);
        if (activeVoters.length > 0 && activeVoters.every((p) => this.activeRound?.votes.has(p.id))) {
          this.finalizeVoting();
        } else {
          this.broadcastAll();
        }
        break;
      }

      case 'room:force_tally': {
        if (!player.isHost || this.phase !== 'VOTING') return;
        this.finalizeVoting();
        break;
      }

      case 'room:back_to_lobby': {
        if (!player.isHost) return;
        this.phase = 'LOBBY';
        this.activeRound = null;
        for (const p of this.players.values()) {
          p.isReadyToVote = false;
          p.inCurrentRound = false;
        }
        this.persistSnapshot();
        this.broadcastAll();
        break;
      }

      case 'room:kick_player': {
        if (!player.isHost) return;
        const target = this.players.get(msg.targetId);
        if (!target || target.id === this.hostId) return;
        this.sendToPlayer(target, { type: 'room:kicked', message: 'You were removed from the room by the host.' });
        if (target.peerConn) {
          try {
            target.peerConn.close();
          } catch {
            // Ignore close error
          }
        }
        this.players.delete(target.id);
        this.persistSnapshot();
        this.broadcastAll();
        break;
      }

      case 'room:leave': {
        if (player.id === this.hostId) return;
        this.players.delete(player.id);
        this.persistSnapshot();
        this.broadcastAll();
        break;
      }
    }
  }

  private finalizeVoting(): void {
    if (!this.activeRound || this.phase !== 'VOTING') return;

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

    this.phase = 'RESULTS';
    this.persistSnapshot();
    this.broadcastAll(true);
  }

  public destroy(clearSnapshot = true): void {
    this.destroyed = true;
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
 * Guest Room Client connecting directly to the Host's phone via PeerJS WebRTC
 * (with instant BroadcastChannel fast-path for same-browser tabs).
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
  private destroyed = false;
  private connectTimeout: number | null = null;
  private reconnectTimer: number | null = null;

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
  }

  private handleIncoming(msg: ServerMessage): void {
    if (this.destroyed) return;
    if (msg.type === 'room:state') {
      this.clearTimers();
      this.callbacks.onStatus('connected');
      this.callbacks.onState(msg.state, msg.secret);
    } else if (msg.type === 'room:error') {
      this.clearTimers();
      this.callbacks.onError(msg.message);
      if (msg.message.includes('already in this room') || msg.message.includes('Room is full')) {
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

  private connect(): void {
    this.clearTimers();

    const joinMsg: ClientMessage = {
      type: 'room:join',
      roomCode: this.roomCode,
      playerId: this.playerId,
      playerName: this.playerName,
    };

    // 1. Fast-path: BroadcastChannel for same-browser tabs
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

    // 2. Primary cross-phone path: PeerJS WebRTC direct to Host phone
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
      if (this.destroyed || this.activeTransport !== 'none') return;
      this.callbacks.onError(
        `Could not reach room ${this.roomCode}. Make sure the host has the room open and check the 4-letter code.`,
      );
      this.destroy();
      this.callbacks.onStatus('idle');
    }, 10000);

    peer.on('open', () => {
      if (this.destroyed || this.activeTransport === 'bc') return;
      const conn = peer.connect(`${PEER_PREFIX}${this.roomCode}`, { reliable: true });
      this.conn = conn;

      conn.on('open', () => {
        if (this.destroyed || this.activeTransport === 'bc') {
          conn.close();
          return;
        }
        this.activeTransport = 'peer';
        if (this.bc) {
          this.bc.close();
          this.bc = null;
        }
        conn.send(joinMsg);
      });

      conn.on('data', (raw) => {
        if (this.destroyed || this.activeTransport !== 'peer') return;
        this.handleIncoming(raw as ServerMessage);
      });

      conn.on('close', () => {
        if (this.destroyed || this.activeTransport !== 'peer') return;
        this.activeTransport = 'none';
        this.callbacks.onStatus('reconnecting');
        this.reconnectTimer = window.setTimeout(() => {
          if (!this.destroyed) this.connect();
        }, 1800);
      });

      conn.on('error', () => {
        if (this.destroyed || this.activeTransport === 'bc') return;
        this.callbacks.onError(
          `Connection to room ${this.roomCode} dropped. Check that the host screen is still open.`,
        );
      });
    });

    peer.on('error', (err) => {
      if (this.destroyed || this.activeTransport === 'bc') return;
      if (err.type === 'peer-unavailable') {
        this.clearTimers();
        this.callbacks.onError(`Room ${this.roomCode} was not found. Ask the host to verify the 4-letter code.`);
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
