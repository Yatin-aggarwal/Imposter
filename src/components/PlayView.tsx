import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Mic, Check } from 'lucide-react';
import type { PublicRoomState, SecretPlayerAssignment } from '../types/game';
import { playCardRevealSound, playVoteCastSound } from '../utils/sound';

interface PlayViewProps {
  room: PublicRoomState;
  secret: SecretPlayerAssignment | null;
  playerId: string;
  onCastVote: (targetId: string) => void;
}

/** Splits "Samosa (Crispy Potato Pastry)" into { main: "Samosa", english: "Crispy Potato Pastry" } */
function splitWordAndEnglish(raw: string): { main: string; english: string | null } {
  const match = raw.match(/^(.+?)\s*\(([^()]+)\)$/);
  if (!match) return { main: raw, english: null };
  return { main: match[1].trim(), english: match[2].trim() };
}

export const PlayView: React.FC<PlayViewProps> = ({ room, secret, playerId, onCastVote }) => {
  const [revealed, setRevealed] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  // Reset card face-down whenever a fresh round starts
  useEffect(() => {
    setRevealed(false);
  }, [room.roundNumber]);

  const isStartingPlayer = room.startingPlayerId === playerId;
  const activePlayers = room.players.filter((p) => p.inCurrentRound);
  const votableTargets = activePlayers.filter((p) => p.id !== playerId);
  const totalVoters = room.activeVoterCount || activePlayers.filter((p) => p.connected).length;
  const progressPct = totalVoters > 0 ? Math.min(100, Math.round((room.votedCount / totalVoters) * 100)) : 0;
  const waitingNames = activePlayers.filter((p) => p.connected && !p.hasVoted).map((p) => p.name);

  const parsedWord = secret?.word ? splitWordAndEnglish(secret.word) : null;

  const handleToggleReveal = () => {
    const next = !revealed;
    setRevealed(next);
    if (next && secret) {
      playCardRevealSound(secret.role === 'imposter');
    }
  };

  const handleTapVote = (targetId: string) => {
    if (!secret) return;
    if (room.myVoteTargetId !== targetId) {
      playVoteCastSound();
      onCastVote(targetId);
    }
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-4 sm:px-6 pt-5 pb-14 space-y-5">
      {/* Compact Random Starter Banner */}
      <div className="rounded-2xl bg-[#151B26] border border-white/[0.08] px-4 py-3.5 sm:px-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
            <Mic className="w-4 h-4 text-amber-400" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-amber-400">Round {room.roundNumber} · Speaks First</p>
            <h1 className="font-display text-lg sm:text-xl font-bold text-white truncate">
              {isStartingPlayer ? 'You start!' : room.startingPlayerName}
            </h1>
          </div>
        </div>
        <div className="font-mono tabular-nums text-sm font-semibold text-amber-400 shrink-0">
          {room.votedCount}/{totalVoters} voted
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
        {/* Left: Clean Minimal Secret Card */}
        <div className="md:col-span-5">
          {secret ? (
            <button
              type="button"
              onClick={handleToggleReveal}
              aria-pressed={revealed}
              className="w-full text-left card-perspective focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-3xl cursor-pointer block"
            >
              <div className={`card-inner relative w-full h-[250px] sm:h-[310px] ${revealed ? 'is-flipped' : ''}`}>
                {/* Card Front (Face-Down) */}
                <div className="card-face absolute inset-0 rounded-3xl overflow-hidden border border-white/15 bg-[#121824] shadow-xl">
                  {!imgFailed ? (
                    <img
                      src="/src/assets/images/card_back_pattern_1795588192900.jpg"
                      alt="Face-down secret card"
                      referrerPolicy="no-referrer"
                      onError={() => setImgFailed(true)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-b from-[#171F2E] to-[#0E121A]" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/25 flex flex-col items-center justify-center gap-2.5 p-6 text-center">
                    <div className="w-11 h-11 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center shadow-lg">
                      <Eye className="w-5 h-5" />
                    </div>
                    <div className="font-display text-2xl font-bold text-white">Tap to Peek</div>
                  </div>
                </div>

                {/* Card Back (Revealed — Minimal: just Civilian + Word, or Imposter + Category) */}
                <div
                  className={`card-face card-face-back absolute inset-0 rounded-3xl border p-6 flex flex-col items-center justify-between text-center shadow-xl ${
                    secret.role === 'imposter'
                      ? 'bg-[#1D1218] border-rose-500/40'
                      : 'bg-[#111C1B] border-emerald-500/35'
                  }`}
                >
                  <div
                    className={`text-sm font-semibold tracking-wide ${
                      secret.role === 'imposter' ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    {secret.role === 'imposter' ? 'Imposter' : 'Civilian'}
                  </div>

                  {secret.role === 'civilian' && parsedWord ? (
                    <div className="my-auto px-2">
                      <div className="font-display text-3xl sm:text-4xl font-bold text-white leading-tight break-words">
                        {parsedWord.main}
                      </div>
                      {parsedWord.english && (
                        <div className="mt-2 text-sm font-medium text-emerald-200/80">
                          {parsedWord.english}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="my-auto px-2">
                      <div className="text-xs font-medium text-rose-300/80 mb-1.5">Category</div>
                      <div className="font-display text-2xl sm:text-3xl font-bold text-white leading-tight break-words">
                        {secret.category}
                      </div>
                    </div>
                  )}

                  <div className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>Tap to hide</span>
                  </div>
                </div>
              </div>
            </button>
          ) : (
            <div className="rounded-3xl bg-[#151B26] border border-white/10 p-6 text-center">
              <h2 className="font-display text-lg font-bold text-white">Round in Progress</h2>
              <p className="mt-1.5 text-sm text-slate-400">
                You&apos;ll automatically join in Round {room.roundNumber + 1}.
              </p>
            </div>
          )}
        </div>

        {/* Right: Simple 1-Tap Voting */}
        <section className="md:col-span-7 rounded-2xl bg-[#151B26] border border-white/[0.08] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 mb-3.5">
            <h2 className="font-display text-lg font-bold text-white">Vote for the Imposter</h2>
            <span className="text-xs text-slate-400">Reveals when all vote</span>
          </div>

          {secret ? (
            <div className="space-y-2">
              {votableTargets.map((target) => {
                const isMyVote = room.myVoteTargetId === target.id;
                return (
                  <button
                    key={target.id}
                    type="button"
                    onClick={() => handleTapVote(target.id)}
                    aria-pressed={isMyVote}
                    className={`w-full min-h-[54px] px-3.5 py-2.5 rounded-xl border flex items-center justify-between gap-3 active:scale-[0.99] transition-[background-color,border-color,transform] duration-150 cursor-pointer ${
                      isMyVote
                        ? 'border-amber-400 bg-amber-500/15'
                        : 'border-white/[0.08] bg-[#0E121A] hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-slate-950 shrink-0"
                        style={{ backgroundColor: target.avatarColor }}
                      >
                        {target.name.slice(0, 2).toUpperCase()}
                      </div>
                      <span className="font-semibold text-white text-sm sm:text-base truncate">
                        {target.name}
                      </span>
                      {target.hasVoted && (
                        <span className="text-[11px] font-medium text-emerald-400 shrink-0">voted</span>
                      )}
                    </div>

                    <div
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold shrink-0 ${
                        isMyVote ? 'text-amber-300' : 'text-slate-400'
                      }`}
                    >
                      {isMyVote ? (
                        <>
                          <Check className="w-4 h-4 stroke-[2.5]" />
                          <span>Selected</span>
                        </>
                      ) : (
                        <span>Vote</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="py-6 text-center text-sm text-slate-400">
              Voting opens for you next round.
            </div>
          )}

          {/* Compact Progress Footer */}
          <div className="mt-4 pt-3.5 border-t border-white/[0.06] space-y-2">
            <div className="h-1.5 w-full rounded-full bg-[#0E121A] overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-[width] duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
              <span className="truncate">
                {waitingNames.length > 0
                  ? `Waiting on: ${waitingNames.join(', ')}`
                  : 'All votes in! Revealing...'}
              </span>
              <span className="font-mono tabular-nums text-amber-400 shrink-0">
                {room.votedCount}/{totalVoters}
              </span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};
