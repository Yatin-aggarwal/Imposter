import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Mic, CheckCircle2, Vote } from 'lucide-react';
import type { PublicRoomState, SecretPlayerAssignment } from '../types/game';
import { playCardRevealSound } from '../utils/sound';

interface PlayViewProps {
  room: PublicRoomState;
  secret: SecretPlayerAssignment | null;
  playerId: string;
  onSetReady: (ready: boolean) => void;
  onOpenVoting: () => void;
}

export const PlayView: React.FC<PlayViewProps> = ({ room, secret, playerId, onSetReady, onOpenVoting }) => {
  const [revealed, setRevealed] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  // Reset card face-down whenever a new round starts
  useEffect(() => {
    setRevealed(false);
  }, [room.roundNumber]);

  const me = room.players.find((p) => p.id === playerId);
  const isHost = Boolean(me?.isHost);
  const isReady = Boolean(me?.isReadyToVote);
  const isStartingPlayer = room.startingPlayerId === playerId;
  const activeConnected = room.players.filter((p) => p.connected && p.inCurrentRound);

  const handleToggleReveal = () => {
    const next = !revealed;
    setRevealed(next);
    if (next && secret) {
      playCardRevealSound(secret.role === 'imposter');
    }
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 pt-5 pb-28 sm:pb-14">
      {/* Top Spotlight: Random Starting Player */}
      <section className="rounded-2xl bg-[#151B26] border border-white/[0.08] p-5 sm:p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
              <Mic className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-xs font-medium text-amber-400">
                Round {room.roundNumber} · Discussion Starter (Randomly Picked)
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-white mt-0.5">
                {isStartingPlayer ? 'You start the round!' : `${room.startingPlayerName} speaks first`}
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Give one spoken clue about the word, then go around the room in person.
              </p>
            </div>
          </div>

          <div className="text-left sm:text-right shrink-0">
            <div className="text-xs text-slate-400">Ready to Vote</div>
            <div className="font-mono tabular-nums text-xl font-bold text-white mt-0.5">
              {room.readyCount} / {activeConnected.length}
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* Left Column: Tactile Secret Card */}
        <div className="lg:col-span-6 flex flex-col items-center">
          {secret ? (
            <div className="w-full max-w-sm">
              <button
                type="button"
                onClick={handleToggleReveal}
                aria-pressed={revealed}
                className="w-full text-left card-perspective focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-3xl cursor-pointer block"
              >
                <div className={`card-inner relative w-full aspect-[3/4] ${revealed ? 'is-flipped' : ''}`}>
                  {/* Card Front (Hidden) */}
                  <div className="card-face absolute inset-0 rounded-3xl overflow-hidden border border-white/15 bg-[#121824] shadow-2xl">
                    {!imgFailed ? (
                      <img
                        src="/src/assets/images/card_back_pattern_1795588192900.jpg"
                        alt="Face-down secret role card"
                        referrerPolicy="no-referrer"
                        onError={() => setImgFailed(true)}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-b from-[#171F2E] to-[#0E121A] flex items-center justify-center p-8">
                        <div className="w-full h-full rounded-2xl border border-amber-500/30 flex items-center justify-center">
                          <Eye className="w-12 h-12 text-amber-400/80" />
                        </div>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/20 flex flex-col justify-between p-6">
                      <div className="text-xs font-mono text-amber-300/90">
                        ROOM {room.code} · ROUND {room.roundNumber}
                      </div>
                      <div className="text-center space-y-2 pb-2">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 shadow-lg">
                          <Eye className="w-5 h-5" />
                        </div>
                        <div className="font-display text-2xl font-bold text-white">Tap to Peek</div>
                        <p className="text-xs text-slate-300">
                          Shield your phone from people sitting beside you
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Card Back (Revealed Secret) */}
                  <div
                    className={`card-face card-face-back absolute inset-0 rounded-3xl border p-6 sm:p-7 flex flex-col justify-between shadow-2xl ${
                      secret.role === 'imposter'
                        ? 'bg-[#1D1218] border-rose-500/40'
                        : 'bg-[#111C1B] border-emerald-500/35'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className={secret.role === 'imposter' ? 'text-rose-400' : 'text-emerald-400'}>
                        {secret.role === 'imposter' ? 'Your Role · Imposter' : 'Your Role · Civilian'}
                      </span>
                      <span className="inline-flex items-center gap-1 text-slate-400">
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>Tap to hide</span>
                      </span>
                    </div>

                    {secret.role === 'civilian' ? (
                      <div className="text-center my-auto py-6">
                        <p className="text-xs font-medium text-slate-400">Secret Word</p>
                        <div className="mt-3 font-display text-3xl sm:text-4xl font-bold text-white leading-tight break-words">
                          {secret.word}
                        </div>
                        <p className="mt-5 text-sm text-slate-300 leading-relaxed">
                          Describe this word naturally so civilians trust you, without making it too easy for the imposter.
                        </p>
                      </div>
                    ) : (
                      <div className="text-center my-auto py-6">
                        <p className="text-xs font-medium text-rose-300">
                          {secret.hintType === 'similar_word'
                            ? 'Your Single Clue · Similar Word'
                            : 'Your Single Clue · Category'}
                        </p>
                        <div className="mt-3 font-display text-3xl sm:text-4xl font-bold text-white leading-tight break-words">
                          {secret.hintValue}
                        </div>
                        <p className="mt-5 text-sm text-slate-300 leading-relaxed">
                          {secret.hintType === 'similar_word'
                            ? 'Everyone else has a closely related word—not this exact one. Listen carefully and blend in!'
                            : 'Everyone else knows a specific famous word in this category. Listen closely and stay undercover!'}
                        </p>
                      </div>
                    )}

                    <div className="pt-4 border-t border-white/10 text-center text-xs text-slate-400">
                      Tap anywhere on card to flip face-down before putting your phone down
                    </div>
                  </div>
                </div>
              </button>
            </div>
          ) : (
            <div className="w-full max-w-sm rounded-3xl bg-[#151B26] border border-white/10 p-8 text-center">
              <h2 className="font-display text-xl font-bold text-white">Round Already Underway</h2>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                You joined while Round {room.roundNumber} was already active. Watch the discussion and you will
                automatically be dealt in for Round {room.roundNumber + 1}.
              </p>
            </div>
          )}
        </div>

        {/* Right Column: Table Status & Move to Voting */}
        <div className="lg:col-span-6 space-y-6">
          <section className="rounded-2xl bg-[#151B26] border border-white/[0.08] p-5 sm:p-6">
            <h2 className="font-display text-lg font-bold text-white">Players at the Table</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Once everyone finishes giving their clues out loud, tap Ready to Vote.
            </p>

            <div className="divide-y divide-white/[0.06] mt-4">
              {room.players.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-slate-950 shrink-0"
                      style={{ backgroundColor: p.avatarColor }}
                    >
                      {p.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white text-sm truncate">
                        {p.name}
                        {p.id === playerId ? ' (You)' : ''}
                      </div>
                      <div className="text-xs text-slate-400">
                        {p.id === room.startingPlayerId ? 'Starts discussion' : p.isHost ? 'Host' : 'Player'}
                      </div>
                    </div>
                  </div>

                  <div className="text-xs font-medium shrink-0">
                    {p.isReadyToVote ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-400">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Ready</span>
                      </span>
                    ) : (
                      <span className="text-slate-500">Discussing</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Controls */}
            <div className="hidden sm:flex flex-col gap-3 mt-6 pt-5 border-t border-white/[0.06]">
              {secret && (
                <button
                  type="button"
                  onClick={() => onSetReady(!isReady)}
                  className={`w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition-colors cursor-pointer ${
                    isReady
                      ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20'
                      : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isReady ? 'Marked Ready — Tap to Undo' : 'Ready to Vote'}</span>
                </button>
              )}

              {isHost && (
                <button
                  type="button"
                  onClick={onOpenVoting}
                  className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#0E121A] px-5 text-sm font-semibold text-slate-100 hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                  <Vote className="w-4 h-4 text-amber-400" />
                  <span>Open Voting Now (Host)</span>
                </button>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Mobile Sticky Action Bar */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-30 p-4 bg-gradient-to-t from-[#0E121A] via-[#0E121A]/95 to-transparent flex gap-2.5">
        {secret && (
          <button
            type="button"
            onClick={() => onSetReady(!isReady)}
            className={`flex-1 min-h-[50px] inline-flex items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold shadow-xl transition-colors cursor-pointer ${
              isReady
                ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                : 'bg-amber-500 text-slate-950'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isReady ? 'Ready' : 'Ready to Vote'}</span>
          </button>
        )}
        {isHost && (
          <button
            type="button"
            onClick={onOpenVoting}
            className="min-h-[50px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-[#151B26] px-4 text-sm font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Vote className="w-4 h-4 text-amber-400" />
            <span>Vote Now</span>
          </button>
        )}
      </div>
    </main>
  );
};
