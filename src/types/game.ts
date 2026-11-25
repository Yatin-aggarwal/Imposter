export type WordRegion = 'indian' | 'global';

export type WordPack = 'mixed' | 'indian' | 'global';

export type GamePhase = 'LOBBY' | 'PLAYING' | 'RESULTS';

export interface WordEntry {
  id: string;
  word: string;
  category: string;
  region: WordRegion;
}

export interface RoomSettings {
  wordPack: WordPack;
  imposterCount: number;
}

export interface PublicPlayer {
  id: string;
  name: string;
  avatarColor: string;
  connected: boolean;
  score: number;
  roundsWon: number;
  roundsPlayed: number;
  hasVoted: boolean;
  inCurrentRound: boolean;
}

export interface SecretPlayerAssignment {
  roundNumber: number;
  role: 'civilian' | 'imposter';
  word?: string;
  category?: string;
}

export interface VoteBreakdownItem {
  voterId: string;
  voterName: string;
  targetId: string;
  targetName: string;
  votedForImposter: boolean;
}

export interface PlayerRoundScoreDelta {
  playerId: string;
  playerName: string;
  pointsEarned: number;
  reason: string;
  wasImposter: boolean;
}

export interface RoundResult {
  roundNumber: number;
  outcome: 'imposter_caught' | 'imposter_escaped' | 'tie_escaped';
  caughtImposter: boolean;
  mostVotedPlayerId: string | null;
  mostVotedPlayerName: string | null;
  mostVotesCount: number;
  imposterIds: string[];
  imposterNames: string[];
  secretWord: string;
  category: string;
  region: WordRegion;
  startingPlayerId: string;
  startingPlayerName: string;
  voteCounts: Record<string, number>;
  voteBreakdown: VoteBreakdownItem[];
  scoreDeltas: PlayerRoundScoreDelta[];
}

export interface PublicRoomState {
  code: string;
  phase: GamePhase;
  roundNumber: number;
  settings: RoomSettings;
  players: PublicPlayer[];
  startingPlayerId: string | null;
  startingPlayerName: string | null;
  usedWordCount: number;
  availableWordCount: number;
  totalBankSize: number;
  votedCount: number;
  activeVoterCount: number;
  myVoteTargetId: string | null;
  lastResult: RoundResult | null;
}

export interface GlobalLeaderboardEntry {
  name: string;
  score: number;
  roundsWon: number;
  roundsPlayed: number;
  imposterWins: number;
  lastPlayedAt: string;
}

export interface WordBankStats {
  total: number;
  indian: number;
  global: number;
  categories: { name: string; region: WordRegion; count: number }[];
}

// Peer-to-peer protocol messages (every player has equal rights; no early reveal or kick powers)
export type ClientMessage =
  | { type: 'room:join'; roomCode: string; playerId: string; playerName: string }
  | { type: 'room:update_settings'; settings: Partial<RoomSettings> }
  | { type: 'room:start_round' }
  | { type: 'room:cast_vote'; targetId: string }
  | { type: 'room:back_to_lobby' }
  | { type: 'room:leave' }
  | { type: 'ping' };

export type ServerMessage =
  | { type: 'room:state'; state: PublicRoomState; secret: SecretPlayerAssignment | null }
  | { type: 'room:error'; message: string }
  | { type: 'room:kicked'; message: string }
  | { type: 'leaderboard:updated'; leaderboard: GlobalLeaderboardEntry[] }
  | { type: 'pong' };
